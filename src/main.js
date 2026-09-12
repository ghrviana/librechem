'use strict';

const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const presets = require('./presets');
const clipboardBridge = require('./clipboard');
const emfExport = require('./emfExport');
const libreOfficeExport = require('./libreOfficeExport');

const KETCHER_DIR = path.join(__dirname, '..', 'vendor', 'ketcher');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

let server = null;
let serverBaseUrl = null;
let mainWindow = null;

// Se o app foi aberto com um .ket exportado antes (a macro "Editar estrutura
// química" do LibreOffice faz isso — ver Fase 7), carrega esse arquivo ao
// iniciar e lembra o id pra "Exportar para LibreOffice" sobrescrever o
// mesmo par de arquivos em vez de criar um novo.
let currentExportId = null;
let pendingKetToLoad = null;

function findKetArgToOpen(argv) {
  return argv.find((arg) => arg.endsWith('.ket') && fs.existsSync(arg));
}

// Injeta o preset de estilo ativo (ex.: ACS Document 1996) como o `ketcher-opts`
// que o Ketcher lê do localStorage ao inicializar. Roda antes do bundle da
// aplicação (script normal, não `defer`) para garantir que já esteja em vigor
// quando o Ketcher iniciar.
function injectActivePreset(html) {
  const activeId = presets.loadActivePresetId(app.getPath('userData'));
  const opts = presets.loadPresetOpts(activeId);
  const script =
    `<script>try{localStorage.setItem('ketcher-opts', ${JSON.stringify(JSON.stringify(opts))});}catch(e){}</script>`;
  return html.replace('<head>', '<head>' + script);
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        let filePath = path.join(KETCHER_DIR, urlPath === '/' ? 'index.html' : urlPath);

        // Impede path traversal para fora de vendor/ketcher.
        if (!filePath.startsWith(KETCHER_DIR)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          // SPA fallback: rotas desconhecidas caem no index.html.
          filePath = path.join(KETCHER_DIR, 'index.html');
        }

        if (path.basename(filePath) === 'index.html') {
          res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
          res.end(injectActivePreset(fs.readFileSync(filePath, 'utf8')));
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      serverBaseUrl = `http://127.0.0.1:${port}/`;
      resolve(serverBaseUrl);
    });

    server.on('error', reject);
  });
}

// Bug encontrado testando múltiplas figuras: o Ketcher mostra uma "sombra"
// (preview) da forma que vai ser desenhada quando o mouse passa por cima da
// área de desenho com uma ferramenta de anel/template selecionada — é só
// visual, não devia contar como estrutura de verdade. Só que
// window.ketcher.getKet() lê esse preview junto com a estrutura real
// enquanto o mouse está sobre o canvas, exportando as duas moléculas juntas
// (validado: Ctrl+Z depois removia as duas de uma vez só, e o problema não
// acontecia se o mouse estivesse fora da área de desenho). Mover o mouse de
// verdade (via sendInputEvent, não um evento sintético de DOM) pra fora do
// canvas antes de ler getKet() força esse preview a sumir.
async function clearHoverPreviewAndWait() {
  try {
    mainWindow.webContents.sendInputEvent({ type: 'mouseMove', x: 0, y: 0 });
  } catch (err) {
    // não deve impedir a exportação se isso falhar
  }
  await new Promise((resolve) => setTimeout(resolve, 80));
}

// Pega a estrutura atual do Ketcher, gera a imagem (SVG ou PNG) no próprio
// renderer (via window.ketcher.generateImage) e manda pro clipboard do
// sistema através do preload (chemdraw:copy-svg / chemdraw:copy-png).
function copyScriptFor(format) {
  return format === 'svg'
    ? `(async () => {
        const struct = await window.ketcher.getKet();
        const blob = await window.ketcher.generateImage(struct, { outputFormat: 'svg' });
        const text = await blob.text();
        await window.chemdraw.copyStructureSvg(text);
      })()`
    : `(async () => {
        const struct = await window.ketcher.getKet();
        const blob = await window.ketcher.generateImage(struct, { outputFormat: 'png' });
        const buf = await blob.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        await window.chemdraw.copyStructurePng(btoa(binary));
      })()`;
}

async function copyStructureCore(format) {
  await clearHoverPreviewAndWait();
  await mainWindow.webContents.executeJavaScript(copyScriptFor(format));
}

async function copyStructureAs(format) {
  try {
    await copyStructureCore(format);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Copiado',
      message:
        format === 'svg'
          ? 'Estrutura copiada como SVG (vetor) para a área de transferência.'
          : 'Estrutura copiada como PNG (alta resolução) para a área de transferência.'
    });
  } catch (err) {
    dialog.showErrorBox('Erro ao copiar estrutura', String((err && err.message) || err));
  }
}

// Exporta a estrutura atual como EMF (via soffice headless), alternativa
// vetorial pra quando o PNG do clipboard não for suficiente: o usuário
// importa o .emf manualmente com Inserir > Imagem no Writer/Impress.
async function exportStructureAsEmf() {
  try {
    await clearHoverPreviewAndWait();
    const svgText = await mainWindow.webContents.executeJavaScript(`(async () => {
      const struct = await window.ketcher.getKet();
      const blob = await window.ketcher.generateImage(struct, { outputFormat: 'svg' });
      return await blob.text();
    })()`);

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar estrutura como EMF',
      defaultPath: 'estrutura.emf',
      filters: [{ name: 'Windows Metafile (EMF)', extensions: ['emf'] }]
    });
    if (canceled || !filePath) return;

    const emfBuffer = await emfExport.convertSvgToEmf(svgText);
    fs.writeFileSync(filePath, emfBuffer);

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Exportado',
      message: `Estrutura exportada como EMF em:\n${filePath}`,
      detail: 'No LibreOffice, use Inserir > Imagem para colar como objeto vetorial editável.'
    });
  } catch (err) {
    dialog.showErrorBox('Erro ao exportar EMF', String((err && err.message) || err));
  }
}

// "Novo"/"Limpar Estrutura" têm que resetar currentExportId — senão o
// próximo "Exportar para LibreOffice" continua sobrescrevendo o id da
// estrutura ANTERIOR (a que estava na tela antes de limpar) com o conteúdo
// da estrutura nova, e a inserção no documento esbarra num Name já usado
// por outra imagem, fazendo o LibreOffice trocar por um nome automático
// tipo "Figura2" — foi exatamente o bug relatado.
function startNewStructure() {
  currentExportId = null;
  mainWindow.webContents.reload();
}

// Complementa startNewStructure(): fica de olho (via polling de getSmiles())
// em o canvas do Ketcher ficar vazio, o que também acontece quando o usuário
// usa o ícone "Clear Canvas" da própria barra de desenho do Ketcher — ação
// que não passa pelo menu nativo do app, então startNewStructure() nunca
// seria chamado só por causa dela. Ao detectar a transição não-vazio →
// vazio, avisa o processo main (via chemdraw:canvas-cleared) pra resetar
// currentExportId, do mesmo jeito que "Novo"/"Limpar Estrutura" fazem.
function watchCanvasCleared() {
  mainWindow.webContents
    .executeJavaScript(
      `(() => {
        let wasEmpty = true;
        setInterval(async () => {
          try {
            const isEmpty = !(await window.ketcher.getSmiles());
            if (isEmpty && !wasEmpty) window.chemdraw.notifyCanvasCleared();
            wasEmpty = isEmpty;
          } catch (e) {}
        }, 800);
      })()`
    )
    .catch(() => {});
}

// A ferramenta "Add text" (Alt+T) do Ketcher fica no último grupo da barra
// lateral esquerda (depois de formas/imagem), fora da área visível sem
// rolar — usada com frequência, então clona o botão original pro topo da
// barra como atalho visual (mantém o Alt+T funcionando do mesmo jeito,
// isso é só conveniência de clique). Um MutationObserver reinsere o clone
// se o React da própria UI do Ketcher re-renderizar a barra e removê-lo.
function injectQuickTextButton() {
  mainWindow.webContents
    .executeJavaScript(
      `(() => {
        function ensureQuickTextButton() {
          const container = document.querySelector('[data-testid="left-toolbar-buttons"]');
          const original = container && container.querySelector('button[data-testid="text"]');
          if (!container || !original) return;

          let quick = container.querySelector('button[data-testid="text-quick-access"]');
          if (quick && container.firstChild === quick) return;

          if (!quick) {
            quick = original.cloneNode(true);
            quick.setAttribute('data-testid', 'text-quick-access');
            quick.addEventListener('click', (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              const alvo = container.querySelector('button[data-testid="text"]');
              if (alvo) alvo.click();
            });
          }
          container.insertBefore(quick, container.firstChild);
        }

        ensureQuickTextButton();
        const raiz = document.querySelector('[data-testid="left-toolbar-buttons"]') || document.body;
        new MutationObserver(ensureQuickTextButton).observe(raiz, { childList: true, subtree: true });
      })()`
    )
    .catch(() => {});
}

// Fase 6/7: exporta .ket + .emf pra pasta que a macro do LibreOffice lê
// (ver src/libreOfficeExport.js). Se currentExportId já estiver setado
// (a estrutura foi aberta a partir de uma exportação anterior, via a macro
// "Editar estrutura química"), sobrescreve o mesmo par de arquivos — assim
// a imagem já colada no documento aponta pro conteúdo atualizado.
async function exportToLibreOfficeCore() {
  await clearHoverPreviewAndWait();
  const { svgText, ketText } = await mainWindow.webContents.executeJavaScript(`(async () => {
    const struct = await window.ketcher.getKet();
    const blob = await window.ketcher.generateImage(struct, { outputFormat: 'svg' });
    return { svgText: await blob.text(), ketText: struct };
  })()`);

  const wasExisting = Boolean(currentExportId);
  const latest = await libreOfficeExport.exportForLibreOffice(svgText, ketText, currentExportId);
  currentExportId = latest.id;
  return { latest, wasExisting };
}

async function exportToLibreOffice() {
  try {
    const { latest, wasExisting } = await exportToLibreOfficeCore();

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Exportado para o LibreOffice',
      message: wasExisting
        ? `Estrutura atualizada (id: ${latest.id}).`
        : `Estrutura exportada (id: ${latest.id}).`,
      detail:
        'No LibreOffice, rode a macro "Inserir Estrutura Química" (Writer/Impress) ' +
        'para colar no documento.'
    });
  } catch (err) {
    dialog.showErrorBox('Erro ao exportar para o LibreOffice', String((err && err.message) || err));
  }
}

function buildMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Novo', accelerator: 'CmdOrCtrl+N', click: () => startNewStructure() },
        { type: 'separator' },
        { label: 'Recarregar Ketcher', accelerator: 'CmdOrCtrl+Shift+R', click: () => startNewStructure() },
        { type: 'separator' },
        { label: 'Sair', role: 'quit' }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { label: 'Desfazer', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Refazer', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Recortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Colar', role: 'paste' },
        { label: 'Selecionar Tudo', role: 'selectAll' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Zoom Aumentar', role: 'zoomIn' },
        { label: 'Zoom Diminuir', role: 'zoomOut' },
        { label: 'Tamanho Real', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Tela Cheia', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Ferramentas de Desenvolvedor', role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Estrutura',
      submenu: [
        {
          label: 'Limpar Estrutura',
          click: () => startNewStructure()
        },
        { type: 'separator' },
        {
          label: 'Copiar como Imagem (SVG) para LibreOffice',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => copyStructureAs('svg')
        },
        {
          label: 'Copiar como Imagem (PNG alta resolução)',
          click: () => copyStructureAs('png')
        },
        { type: 'separator' },
        {
          label: 'Exportar como EMF (vetor editável no LibreOffice)...',
          click: () => exportStructureAsEmf()
        },
        {
          label: 'Exportar para LibreOffice (.ket + .emf)',
          accelerator: 'CmdOrCtrl+E',
          click: () => exportToLibreOffice()
        }
      ]
    },
    {
      label: 'Estilo',
      submenu: (() => {
        const manifest = presets.loadManifest();
        const activeId = presets.loadActivePresetId(app.getPath('userData'));
        return manifest.map((p) => ({
          label: p.label,
          type: 'radio',
          checked: p.id === activeId,
          click: () => {
            presets.saveActivePresetId(app.getPath('userData'), p.id);
            startNewStructure();
          }
        }));
      })()
    },
    {
      label: 'Texto',
      submenu: [{ label: '(usar ferramenta de texto na paleta)', enabled: false }]
    },
    {
      label: 'Cor',
      submenu: [{ label: '(usar menu de cor do Ketcher)', enabled: false }]
    },
    {
      label: 'Janela',
      role: 'windowMenu'
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre o ChemDraw Linux',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Sobre',
              message: 'ChemDraw Linux',
              detail:
                'Editor de estruturas químicas 2D baseado no Ketcher (EPAM, MIT).\nVersão do app: ' +
                app.getVersion()
            })
        },
        {
          label: 'Repositório do Ketcher',
          click: () => shell.openExternal('https://github.com/epam/ketcher')
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  if (!fs.existsSync(path.join(KETCHER_DIR, 'index.html'))) {
    dialog.showErrorBox(
      'Ketcher não encontrado',
      'O build do Ketcher não foi encontrado em vendor/ketcher.\n\n' +
        'Rode: npm run fetch-ketcher'
    );
    app.quit();
    return;
  }

  await startStaticServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#ffffff',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(true);
  buildMenu();

  await mainWindow.loadURL(serverBaseUrl);

  try {
    // window.ketcher só existe depois que o próprio Ketcher termina de
    // inicializar — carregar a URL não é suficiente, precisa esperar.
    await mainWindow.webContents.executeJavaScript(`(async () => {
      for (let i = 0; i < 100 && !window.ketcher; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!window.ketcher) throw new Error('Ketcher não inicializou a tempo.');
    })()`);
  } catch (err) {
    dialog.showErrorBox('Erro ao inicializar', String((err && err.message) || err));
  }

  if (pendingKetToLoad) {
    try {
      await mainWindow.webContents.executeJavaScript(
        `window.ketcher.setMolecule(${JSON.stringify(pendingKetToLoad)})`
      );
    } catch (err) {
      dialog.showErrorBox('Erro ao abrir estrutura', String((err && err.message) || err));
    }
    pendingKetToLoad = null;
  }

  watchCanvasCleared();
  injectQuickTextButton();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Utilitário de dev: CHEMDRAW_SCREENSHOT=/caminho/arquivo.png npm start
  // captura a janela pronta e fecha o app (usado para validar builds sem UI interativa).
  if (process.env.CHEMDRAW_SCREENSHOT) {
    const outPath = process.env.CHEMDRAW_SCREENSHOT;
    const testSmiles = process.env.CHEMDRAW_TEST_SMILES;
    setTimeout(async () => {
      if (testSmiles) {
        try {
          await mainWindow.webContents.executeJavaScript(
            `window.ketcher.setMolecule(${JSON.stringify(testSmiles)})`
          );
          await new Promise((r) => setTimeout(r, 1500));
        } catch (err) {
          console.error('[CHEMDRAW_TEST_SMILES] erro ao setar molécula:', err);
        }
      }
      if (process.env.CHEMDRAW_TEST_EXPORT) {
        try {
          const { latest, wasExisting } = await exportToLibreOfficeCore();
          fs.writeFileSync(
            process.env.CHEMDRAW_TEST_EXPORT,
            JSON.stringify({ ok: true, latest, wasExisting }, null, 2)
          );
        } catch (err) {
          fs.writeFileSync(
            process.env.CHEMDRAW_TEST_EXPORT,
            JSON.stringify({ ok: false, error: err.message }, null, 2)
          );
        }
      }
      if (process.env.CHEMDRAW_TEST_CLEAR_BUG) {
        try {
          const result1 = await exportToLibreOfficeCore();
          startNewStructure();
          await new Promise((r) => setTimeout(r, 1500));
          await mainWindow.webContents.executeJavaScript(`(async () => {
            for (let i = 0; i < 100 && !window.ketcher; i++) {
              await new Promise((r) => setTimeout(r, 100));
            }
            await window.ketcher.setMolecule('C1CCCCC1');
          })()`);
          await new Promise((r) => setTimeout(r, 1000));
          const result2 = await exportToLibreOfficeCore();
          fs.writeFileSync(
            process.env.CHEMDRAW_TEST_CLEAR_BUG,
            JSON.stringify(
              {
                id1: result1.latest.id,
                id2: result2.latest.id,
                sameId: result1.latest.id === result2.latest.id
              },
              null,
              2
            )
          );
        } catch (err) {
          fs.writeFileSync(process.env.CHEMDRAW_TEST_CLEAR_BUG, 'ERROR: ' + err.message);
        }
      }
      if (process.env.CHEMDRAW_TEST_COPY) {
        const { clipboard } = require('electron');
        try {
          await copyStructureCore(process.env.CHEMDRAW_TEST_COPY);
          const items = await clipboard.read();
          fs.writeFileSync(
            process.env.CHEMDRAW_COPY_VERIFY,
            JSON.stringify({ types: items.map((i) => i.types) }, null, 2)
          );
        } catch (err) {
          fs.writeFileSync(process.env.CHEMDRAW_COPY_VERIFY, 'ERROR: ' + err.message);
        }
      }
      if (process.env.CHEMDRAW_TEST_QUICK_TEXT) {
        try {
          const result = await mainWindow.webContents.executeJavaScript(`(async () => {
            const container = document.querySelector('[data-testid="left-toolbar-buttons"]');
            // força o Ketcher a re-renderizar a barra selecionando outra ferramenta antes
            container.querySelector('button[data-testid="hand"]').click();
            await new Promise((r) => setTimeout(r, 200));
            const sobreviveuAoRerender = !!container.querySelector('button[data-testid="text-quick-access"]');
            const eraPrimeiroFilho = container.firstChild === container.querySelector('button[data-testid="text-quick-access"]');
            container.querySelector('button[data-testid="text-quick-access"]').click();
            await new Promise((r) => setTimeout(r, 200));
            const original = container.querySelector('button[data-testid="text"]');
            const classeDoOriginalDepoisDoClique = original.className;
            return { sobreviveuAoRerender, eraPrimeiroFilho, classeDoOriginalDepoisDoClique };
          })()`);
          fs.writeFileSync(process.env.CHEMDRAW_TEST_QUICK_TEXT, JSON.stringify(result, null, 2));
        } catch (err) {
          fs.writeFileSync(process.env.CHEMDRAW_TEST_QUICK_TEXT, 'ERROR: ' + err.message);
        }
      }
      if (process.env.CHEMDRAW_TEST_JS_FILE) {
        // Utilitário de dev genérico: roda um trecho de JS async arbitrário
        // (lido de um arquivo, pra não precisar escapar aspas na env var)
        // dentro da página antes do screenshot final — usado pra investigar
        // a UI do Ketcher (achar seletores, clicar botões/toggles) sem
        // precisar automatizar clique real de mouse.
        try {
          const code = fs.readFileSync(process.env.CHEMDRAW_TEST_JS_FILE, 'utf8');
          const result = await mainWindow.webContents.executeJavaScript(`(async () => {${code}})()`);
          if (process.env.CHEMDRAW_TEST_JS_OUT) {
            fs.writeFileSync(process.env.CHEMDRAW_TEST_JS_OUT, JSON.stringify(result, null, 2));
          }
        } catch (err) {
          console.error('[CHEMDRAW_TEST_JS_FILE] erro:', err);
          if (process.env.CHEMDRAW_TEST_JS_OUT) {
            fs.writeFileSync(process.env.CHEMDRAW_TEST_JS_OUT, 'ERROR: ' + err.message);
          }
        }
      }
      const image = await mainWindow.webContents.capturePage();
      fs.writeFileSync(outPath, image.toPNG());
      app.quit();
    }, 2000);
  }
}

ipcMain.handle('chemdraw:copy-svg', async (_event, svgText) => {
  await clipboardBridge.writeSvgToClipboard(svgText);
});

ipcMain.handle('chemdraw:copy-png', async (_event, base64Png) => {
  await clipboardBridge.writePngToClipboard(base64Png);
});

// Ver watchCanvasCleared(): o Ketcher tem seu próprio ícone "Clear Canvas"
// na barra de desenho, que não passa pelo menu nativo do app — então
// startNewStructure() (chamado por "Novo"/"Limpar Estrutura") não é
// acionado por ele. Sem resetar currentExportId aqui também, o próximo
// "Exportar para LibreOffice" sobrescrevia o .ket/.emf da estrutura
// ANTERIOR com o conteúdo da nova (bug real: editar uma figura já inserida
// sempre reabria a mais recente, não a que estava selecionada).
ipcMain.on('chemdraw:canvas-cleared', () => {
  currentExportId = null;
});

const ketArg = findKetArgToOpen(process.argv);
if (ketArg) {
  pendingKetToLoad = fs.readFileSync(ketArg, 'utf8');
  currentExportId = libreOfficeExport.idFromKetPath(ketArg);
}

app.whenReady().then(() => {
  // A macro "Editar Estrutura Química" do LibreOffice usa esse script pra
  // saber como reabrir o app com um .ket específico (ver Fase 7).
  try {
    libreOfficeExport.ensureLauncherScript(path.join(__dirname, '..'));
  } catch (err) {
    console.error('Erro ao gravar o launcher pro LibreOffice:', err.message);
  }
  return createWindow();
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

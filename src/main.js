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

// Fase 6/7: exporta .ket + .emf pra pasta que a macro do LibreOffice lê
// (ver src/libreOfficeExport.js). Se currentExportId já estiver setado
// (a estrutura foi aberta a partir de uma exportação anterior, via a macro
// "Editar estrutura química"), sobrescreve o mesmo par de arquivos — assim
// a imagem já colada no documento aponta pro conteúdo atualizado.
async function exportToLibreOfficeCore() {
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
        { label: 'Novo', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.reload() },
        { type: 'separator' },
        { label: 'Recarregar Ketcher', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow.webContents.reload() },
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
          click: () => mainWindow.webContents.reload()
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
            mainWindow.webContents.reload();
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

const ketArg = findKetArgToOpen(process.argv);
if (ketArg) {
  pendingKetToLoad = fs.readFileSync(ketArg, 'utf8');
  currentExportId = libreOfficeExport.idFromKetPath(ketArg);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

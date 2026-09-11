'use strict';

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

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
        }
      ]
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
      const image = await mainWindow.webContents.capturePage();
      fs.writeFileSync(outPath, image.toPNG());
      app.quit();
    }, 2000);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

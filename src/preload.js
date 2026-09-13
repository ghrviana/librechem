'use strict';

// Ponte entre o processo main e o Ketcher embutido: expõe só o necessário
// pra Fase 3 (copiar estrutura como imagem pro LibreOffice).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('librechem', {
  copyStructureSvg: (svgText) => ipcRenderer.invoke('librechem:copy-svg', svgText),
  copyStructurePng: (base64Png) => ipcRenderer.invoke('librechem:copy-png', base64Png),
  notifyCanvasCleared: () => ipcRenderer.send('librechem:canvas-cleared')
});

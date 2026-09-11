'use strict';

// Ponte entre o processo main e o Ketcher embutido: expõe só o necessário
// pra Fase 3 (copiar estrutura como imagem pro LibreOffice).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chemdraw', {
  copyStructureSvg: (svgText) => ipcRenderer.invoke('chemdraw:copy-svg', svgText),
  copyStructurePng: (base64Png) => ipcRenderer.invoke('chemdraw:copy-png', base64Png)
});

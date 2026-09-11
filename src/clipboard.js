'use strict';

// Fase 3: copiar a estrutura desenhada pro clipboard do sistema, pra colar
// no LibreOffice (Writer/Impress).
//
// Testado e descartado: `clipboard.write([new ClipboardItem(...)])` do
// próprio Electron (>=32) — parece suportar múltiplos mime types, mas na
// prática, no Linux, só o `image/png` chega de fato no clipboard do
// sistema (verificado com `clipboard.read()`); mime types customizados
// como `image/svg+xml` ficam só no sandbox de "custom formats" do Chromium
// e não chegam a apps nativos como o LibreOffice.
//
// Solução que funciona: SVG via `xclip`/`wl-copy` (grava direto no
// clipboard X11/Wayland com o mime type real, do jeito que qualquer app
// GTK/Qt sabe ler) e PNG via `clipboard.write()` do Electron (esse sim
// funciona nativamente pra imagem). Ver README para o resultado dos
// testes de colagem no LibreOffice.

const { clipboard, ClipboardItem } = require('electron');
const { spawn, execFileSync } = require('child_process');

function commandExists(cmd) {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// X11 (xclip) ou Wayland (wl-copy), detectado pela sessão ativa.
function detectLinuxClipboardTool() {
  return process.env.WAYLAND_DISPLAY ? 'wl-copy' : 'xclip';
}

function writeSvgToClipboard(svgText) {
  const tool = detectLinuxClipboardTool();
  if (!commandExists(tool)) {
    const alt = tool === 'xclip' ? 'wl-copy' : 'xclip';
    const installHint = tool === 'xclip' ? 'sudo apt install xclip' : 'sudo apt install wl-clipboard';
    const altNote = commandExists(alt)
      ? ` (${alt} está disponível, mas essa sessão usa ${tool === 'xclip' ? 'X11' : 'Wayland'}.)`
      : '';
    throw new Error(`"${tool}" não encontrado no PATH. Instale com: ${installHint}${altNote}`);
  }

  const args =
    tool === 'xclip'
      ? ['-i', '-selection', 'clipboard', '-t', 'image/svg+xml']
      : ['-t', 'image/svg+xml'];

  return new Promise((resolve, reject) => {
    const proc = spawn(tool, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${tool} saiu com código ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
    proc.stdin.write(svgText);
    proc.stdin.end();
  });
}

async function writePngToClipboard(base64Png) {
  const buffer = Buffer.from(base64Png, 'base64');
  if (buffer.length === 0) {
    throw new Error('PNG gerado veio vazio.');
  }
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([buffer], { type: 'image/png' }) })]);
}

module.exports = {
  writeSvgToClipboard,
  writePngToClipboard,
  detectLinuxClipboardTool,
  commandExists
};

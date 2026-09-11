'use strict';

// Alternativa vetorial pro clipboard (ver README): SVG->EMF via LibreOffice
// headless (`soffice --convert-to emf`), pra o usuário importar manualmente
// com Inserir > Imagem no Writer/Impress — isso cola como objeto vetorial
// editável, diferente do clipboard direto (que só funciona em PNG).

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function convertSvgToEmf(svgText) {
  return new Promise((resolve, reject) => {
    let tmpDir;
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chemdraw-emf-'));
    } catch (err) {
      reject(err);
      return;
    }
    const svgPath = path.join(tmpDir, 'structure.svg');
    fs.writeFileSync(svgPath, svgText, 'utf8');

    execFile(
      'soffice',
      ['--headless', '--convert-to', 'emf', '--outdir', tmpDir, svgPath],
      { timeout: 30000 },
      (err) => {
        const emfPath = path.join(tmpDir, 'structure.emf');
        if (err || !fs.existsSync(emfPath)) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          reject(
            new Error(
              'Falha ao converter para EMF. É preciso ter o LibreOffice ("soffice") instalado.' +
                (err ? ` (${err.message})` : '')
            )
          );
          return;
        }
        const buffer = fs.readFileSync(emfPath);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        resolve(buffer);
      }
    );
  });
}

module.exports = { convertSvgToEmf };

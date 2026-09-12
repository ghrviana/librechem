'use strict';

// Backup/portabilidade da Biblioteca de Estruturas
// (~/.local/share/chemdraw-linux/exports/): exportar tudo num único .zip
// (pra levar pra outro computador) e importar de volta, sem depender de
// nenhuma sincronização/nuvem — é só copiar o arquivo .zip. Usa os
// binários `zip`/`unzip` (já exigidos pelo projeto, ver README) em vez de
// uma dependência npm nova.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { EXPORT_DIR } = require('./libreOfficeExport');

function run(cmd, args, options) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, options, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} ${args.join(' ')} falhou: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });
}

// Zipa todo o conteúdo de EXPORT_DIR (.ket/.emf/.json de cada estrutura e
// latest.json) em destZipPath.
async function exportLibraryToZip(destZipPath) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const entries = fs.readdirSync(EXPORT_DIR);
  const count = entries.filter((n) => n.endsWith('.ket')).length;
  if (count === 0) {
    throw new Error('Nenhuma estrutura exportada ainda — não há nada pra exportar.');
  }
  fs.rmSync(destZipPath, { force: true }); // `zip` não sobrescreve sozinho, dá erro se o arquivo já existir
  await run('zip', ['-rq', destZipPath, '.'], { cwd: EXPORT_DIR });
  return { count };
}

// Extrai um .zip gerado por exportLibraryToZip (dessa mesma máquina ou de
// outra) pra dentro de EXPORT_DIR, SEM sobrescrever nenhuma estrutura que já
// exista localmente (id repetido = já existe, já que o id é um timestamp —
// só colidiria se duas exportações tivessem sido feitas no mesmíssimo
// segundo em máquinas diferentes). O latest.json do zip importado é
// ignorado de propósito: cada máquina mantém seu próprio "latest" (a última
// exportação feita NELA mesma), não a de quem gerou o zip.
async function importLibraryFromZip(srcZipPath) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chemdraw-import-'));
  try {
    await run('unzip', ['-oq', srcZipPath, '-d', tmpDir]);
    const ids = fs
      .readdirSync(tmpDir)
      .filter((n) => n.endsWith('.ket'))
      .map((n) => n.slice(0, -4));

    let imported = 0;
    let skipped = 0;
    for (const id of ids) {
      if (fs.existsSync(path.join(EXPORT_DIR, `${id}.ket`))) {
        skipped++;
        continue;
      }
      for (const ext of ['.ket', '.emf', '.json']) {
        const src = path.join(tmpDir, `${id}${ext}`);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(EXPORT_DIR, `${id}${ext}`));
        }
      }
      imported++;
    }
    return { imported, skipped };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Apaga todo o histórico de exportações (todos os .ket/.emf/.json e
// latest.json) — mantém a pasta em si, só limpa o conteúdo. Ação
// destrutiva: quem chama é responsável por confirmar com o usuário antes.
function clearExportHistory() {
  if (!fs.existsSync(EXPORT_DIR)) return { count: 0 };
  const entries = fs.readdirSync(EXPORT_DIR);
  const count = entries.filter((n) => n.endsWith('.ket')).length;
  for (const name of entries) {
    fs.rmSync(path.join(EXPORT_DIR, name), { force: true });
  }
  return { count };
}

module.exports = {
  exportLibraryToZip,
  importLibraryFromZip,
  clearExportHistory
};

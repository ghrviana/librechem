'use strict';

// Fase 6/7: integração por arquivo com o LibreOffice (mais confiável que o
// clipboard, que colava SVG/EMF de forma inconsistente — ver Fase 3).
//
// Cada exportação grava um par <id>.ket / <id>.emf na pasta de exports e
// atualiza latest.json com esse id. A macro do LibreOffice (ver
// libreoffice-macro/ChemDrawLinux.bas) lê latest.json, insere o .emf no
// documento e marca a forma inserida com Name = id — isso é o que permite
// a edição bidirecional da Fase 7 (selecionar a imagem no documento e
// achar o .ket correspondente pra reabrir no editor).

const fs = require('fs');
const os = require('os');
const path = require('path');
const emfExport = require('./emfExport');
const { getPaddedSizeMM } = require('./svgUtils');

const EXPORT_DIR = path.join(os.homedir(), '.local', 'share', 'chemdraw-linux', 'exports');

function timestampId(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

function pathsForId(id) {
  return {
    ketPath: path.join(EXPORT_DIR, `${id}.ket`),
    emfPath: path.join(EXPORT_DIR, `${id}.emf`),
    latestPath: path.join(EXPORT_DIR, 'latest.json')
  };
}

// svgText: SVG gerado pelo Ketcher (window.ketcher.generateImage). ketText:
// conteúdo .ket (window.ketcher.getKet(), já em JSON string). Se
// `existingId` for passado (edição de uma estrutura já exportada antes),
// sobrescreve o mesmo par de arquivos em vez de gerar um id novo — é o que
// mantém a imagem já colada no documento apontando pro mesmo lugar (Fase 7).
async function exportForLibreOffice(svgText, ketText, existingId) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });

  const id = existingId || timestampId();
  const { ketPath, emfPath, latestPath } = pathsForId(id);

  fs.writeFileSync(ketPath, ketText, 'utf8');

  const emfBuffer = await emfExport.convertSvgToEmf(svgText);
  fs.writeFileSync(emfPath, emfBuffer);

  const size = getPaddedSizeMM(svgText);
  const latest = { id, ket: ketPath, emf: emfPath, widthMM: size && size.widthMM, heightMM: size && size.heightMM };
  fs.writeFileSync(latestPath, JSON.stringify(latest, null, 2), 'utf8');

  return latest;
}

function readKetById(id) {
  const { ketPath } = pathsForId(id);
  if (!fs.existsSync(ketPath)) return null;
  return fs.readFileSync(ketPath, 'utf8');
}

// Reconhece um caminho de arquivo como um .ket já rastreado nessa pasta de
// exports (usado ao abrir o app com um arquivo passado pela macro "Editar
// estrutura química") e devolve o id, ou null se for um .ket qualquer.
function idFromKetPath(filePath) {
  const resolved = path.resolve(filePath);
  if (path.dirname(resolved) !== EXPORT_DIR || path.extname(resolved) !== '.ket') return null;
  return path.basename(resolved, '.ket');
}

module.exports = {
  EXPORT_DIR,
  exportForLibreOffice,
  readKetById,
  timestampId,
  idFromKetPath
};

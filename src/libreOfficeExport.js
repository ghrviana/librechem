'use strict';

// Fase 6/7: integração por arquivo com o LibreOffice (mais confiável que o
// clipboard, que colava SVG/EMF de forma inconsistente — ver Fase 3).
//
// Cada exportação grava um par <id>.ket / <id>.emf na pasta de exports e
// atualiza latest.json com esse id. A macro do LibreOffice (ver
// libreoffice-macro/LibreChem.bas) lê latest.json, insere o .emf no
// documento e marca a forma inserida com Name = id — isso é o que permite
// a edição bidirecional da Fase 7 (selecionar a imagem no documento e
// achar o .ket correspondente pra reabrir no editor).

const fs = require('fs');
const os = require('os');
const path = require('path');
const emfExport = require('./emfExport');
const { getPaddedSizeMM } = require('./svgUtils');

const EXPORT_DIR = path.join(os.homedir(), '.local', 'share', 'librechem', 'exports');

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
    metaPath: path.join(EXPORT_DIR, `${id}.json`),
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
  const { ketPath, emfPath, metaPath, latestPath } = pathsForId(id);

  fs.writeFileSync(ketPath, ketText, 'utf8');

  const emfBuffer = await emfExport.convertSvgToEmf(svgText);
  fs.writeFileSync(emfPath, emfBuffer);

  const size = getPaddedSizeMM(svgText);
  const latest = {
    id,
    ket: ketPath,
    emf: emfPath,
    widthMM: size && size.widthMM,
    heightMM: size && size.heightMM,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(latestPath, JSON.stringify(latest, null, 2), 'utf8');

  // Sidecar por id (Biblioteca de Estruturas): latest.json só guarda a
  // exportação mais recente e é sobrescrito a cada Ctrl+E, então sem isso os
  // metadados (tamanho) de estruturas mais antigas se perderiam assim que
  // outra fosse exportada. A macro InserirEstruturaPorId (LibreChem.bas)
  // lê esse arquivo pra inserir qualquer estrutura passada, não só a mais
  // recente.
  fs.writeFileSync(metaPath, JSON.stringify(latest, null, 2), 'utf8');

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

const APP_DATA_DIR = path.join(os.homedir(), '.local', 'share', 'librechem');
const LAUNCHER_PATH = path.join(APP_DATA_DIR, 'open-ket.sh');

// Escreve (ou atualiza) um script que a macro "Editar Estrutura Química" do
// LibreOffice usa pra reabrir o app com um .ket específico — sem isso, a
// macro Basic não teria como saber onde/como rodar o LibreChem.
// Regenerado a cada início do app, então sempre aponta pra instalação atual
// (útil em dev, onde a pasta do projeto pode mudar).
//
// Empacotado (.deb/.rpm/AppImage) e em dev precisam de comandos bem
// diferentes: empacotado, `execPath` já É o binário final (ex.:
// /opt/LibreChem/librechem) — só rodar ele direto, sem `cd` (o app resolve
// tudo que precisa via caminho absoluto internamente, não do cwd). Em dev,
// `execPath` aponta pro binário do Electron dentro de node_modules, que só
// funciona rodado de dentro da pasta do projeto com `.` como app a carregar
// — daí o `cd` + `electron .`. Bug real encontrado: antes disso, o script
// gerado num app empacotado tentava `cd` pra dentro do `app.asar` (não é
// um diretório de verdade) e chamar um `node_modules/.bin/electron` que
// não existe empacotado — "Editar Estrutura" na macro falhava calado
// (Shell() do Basic não reporta erro nenhum de volta).
function ensureLauncherScript({ isPackaged, execPath, projectRoot }) {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
  const script = isPackaged
    ? `#!/bin/bash\n` + `exec ${JSON.stringify(execPath)} "$1"\n`
    : `#!/bin/bash\n` +
      `exec env -u ELECTRON_RUN_AS_NODE ${JSON.stringify(execPath)} ${JSON.stringify(projectRoot)} "$1"\n`;
  fs.writeFileSync(LAUNCHER_PATH, script, { mode: 0o755 });
  return LAUNCHER_PATH;
}

module.exports = {
  EXPORT_DIR,
  LAUNCHER_PATH,
  exportForLibreOffice,
  readKetById,
  timestampId,
  idFromKetPath,
  ensureLauncherScript
};

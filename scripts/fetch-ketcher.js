#!/usr/bin/env node
'use strict';

// Baixa o build estático (standalone) do Ketcher a partir dos releases oficiais
// do EPAM no GitHub e extrai em vendor/ketcher/. Roda automaticamente no
// `npm install` (postinstall) e pode ser reexecutado manualmente com
// `npm run fetch-ketcher`.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const KETCHER_VERSION = '3.18.0';
const ASSET_NAME = `ketcher-standalone-${KETCHER_VERSION}.zip`;
const DOWNLOAD_URL = `https://github.com/epam/ketcher/releases/download/v${KETCHER_VERSION}/${ASSET_NAME}`;

const ROOT = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(ROOT, 'vendor');
const DEST_DIR = path.join(VENDOR_DIR, 'ketcher');
const MARKER_FILE = path.join(DEST_DIR, '.version');
const TMP_ZIP = path.join(VENDOR_DIR, ASSET_NAME);

function alreadyFetched() {
  return (
    fs.existsSync(MARKER_FILE) &&
    fs.readFileSync(MARKER_FILE, 'utf8').trim() === KETCHER_VERSION &&
    fs.existsSync(path.join(DEST_DIR, 'index.html'))
  );
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        download(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`Falha ao baixar ${url}: HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  if (alreadyFetched()) {
    console.log(`[fetch-ketcher] Ketcher ${KETCHER_VERSION} já está em vendor/ketcher, pulando download.`);
    return;
  }

  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  if (fs.existsSync(DEST_DIR)) {
    fs.rmSync(DEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DEST_DIR, { recursive: true });

  console.log(`[fetch-ketcher] Baixando Ketcher ${KETCHER_VERSION} (standalone)...`);
  console.log(`[fetch-ketcher] ${DOWNLOAD_URL}`);
  await download(DOWNLOAD_URL, TMP_ZIP);

  console.log('[fetch-ketcher] Extraindo...');
  execFileSync('unzip', ['-oq', TMP_ZIP, '-d', DEST_DIR]);

  fs.unlinkSync(TMP_ZIP);
  fs.writeFileSync(MARKER_FILE, KETCHER_VERSION + '\n');

  console.log(`[fetch-ketcher] Pronto: vendor/ketcher (Ketcher ${KETCHER_VERSION}).`);
}

main().catch((err) => {
  console.error('[fetch-ketcher] Erro:', err.message);
  process.exit(1);
});

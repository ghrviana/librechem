'use strict';

// Sistema de presets de estilo de renderização (ACS Document 1996, etc.).
// Cada preset é um JSON com o formato exato de `ketcher-opts` (o objeto que o
// próprio Ketcher persiste no localStorage quando o usuário mexe em Editar >
// Configurações). Extraídos clicando no botão nativo "Set ACS Settings" do
// Ketcher e comparando com o estado padrão de fábrica.

const fs = require('fs');
const path = require('path');

const PRESETS_DIR = path.join(__dirname, '..', 'presets');
const MANIFEST_PATH = path.join(PRESETS_DIR, 'manifest.json');
const DEFAULT_PRESET_ID = 'acs-1996';

function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function loadPresetOpts(id) {
  const manifest = loadManifest();
  const entry = manifest.find((p) => p.id === id) || manifest.find((p) => p.id === DEFAULT_PRESET_ID);
  return JSON.parse(fs.readFileSync(path.join(PRESETS_DIR, entry.file), 'utf8'));
}

function statePath(userDataPath) {
  return path.join(userDataPath, 'chemdraw-state.json');
}

function loadActivePresetId(userDataPath) {
  try {
    const state = JSON.parse(fs.readFileSync(statePath(userDataPath), 'utf8'));
    return state.activePreset || DEFAULT_PRESET_ID;
  } catch {
    return DEFAULT_PRESET_ID;
  }
}

function saveActivePresetId(userDataPath, id) {
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(statePath(userDataPath), JSON.stringify({ activePreset: id }, null, 2));
}

module.exports = {
  DEFAULT_PRESET_ID,
  loadManifest,
  loadPresetOpts,
  loadActivePresetId,
  saveActivePresetId
};

# ChemDraw Linux

Editor de estruturas químicas 2D estilo ChemDraw para Linux (Zorin OS/Ubuntu e
Fedora), construído em cima do [Ketcher](https://github.com/epam/ketcher)
(EPAM, MIT) embutido em uma janela Electron.

> Nome do projeto e licença são provisórios (uso pessoal). Ajustar antes de
> qualquer publicação.

## Status

Fase 1 (MVP) em andamento: Electron embutindo o build estático do Ketcher.

## Requisitos

- Node.js 20+ e npm
- `unzip` disponível no PATH (usado para extrair o build do Ketcher)
- Linux (testado em Zorin OS 17.3 / base Ubuntu 22.04)

## Uso

```bash
npm install       # instala deps e baixa o build do Ketcher (postinstall)
npm start          # abre o app
```

Se precisar baixar/atualizar o Ketcher manualmente:

```bash
npm run fetch-ketcher
```

## Como funciona

- `src/main.js`: processo principal do Electron. Sobe um servidor HTTP local
  (`127.0.0.1:<porta aleatória>`) servindo os arquivos estáticos em
  `vendor/ketcher/` e carrega essa URL na janela — evitar `file://` diretamente
  contorna problemas de `fetch()` do WASM do Indigo sob esse protocolo.
- `vendor/ketcher/`: build "standalone" pré-compilado do Ketcher (baixado dos
  releases do GitHub via `scripts/fetch-ketcher.js`), não versionado no git.
- Menu nativo (Arquivo/Editar/Ver/Estrutura/Texto/Cor/Janela) definido em
  `src/main.js`, no espírito do ChemDraw. Itens de Estrutura/Texto/Cor mais
  profundos serão ligados à UI do Ketcher na Fase 4 (layout customizado).

## Roteiro

1. **MVP** — Electron básico embutindo o Ketcher. _(atual)_
2. **Preset ACS** — parâmetros de renderização (ACS Document 1996).
3. **Clipboard** — copiar estrutura como SVG/PNG e colar no LibreOffice.
4. **UI customizada** — layout estilo ChemDraw (paleta à esquerda, status bar).
5. **Empacotamento** — AppImage, depois `.deb` e `.rpm`/Flatpak.

## Copiar e colar no LibreOffice

_A documentar na Fase 3._

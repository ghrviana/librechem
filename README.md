# ChemDraw Linux

Editor de estruturas químicas 2D estilo ChemDraw para Linux (Zorin OS/Ubuntu e
Fedora), construído em cima do [Ketcher](https://github.com/epam/ketcher)
(EPAM, MIT) embutido em uma janela Electron.

> Nome do projeto e licença são provisórios (uso pessoal). Ajustar antes de
> qualquer publicação.

## Status

Fases 1 (MVP), 2 (preset ACS), 3 (clipboard) e 6 (integração por arquivo +
macro do LibreOffice) concluídas e validadas. Fase 4 (UI customizada) foi
pulada por enquanto a pedido do usuário — a integração por arquivo/macro
(Fase 6/7) ficou mais prioritária depois que a colagem via clipboard se
mostrou inconsistente pra estruturas maiores.

## Requisitos

- Node.js 20+ e npm
- `unzip` disponível no PATH (usado para extrair o build do Ketcher)
- `xclip` (sessões X11) ou `wl-clipboard`/`wl-copy` (sessões Wayland) — necessário
  para copiar a estrutura como SVG. Instale com `sudo apt install xclip` ou
  `sudo apt install wl-clipboard`.
- LibreOffice (`soffice` no PATH) — necessário só para a exportação EMF
  (Estrutura > Exportar como EMF).
- Linux (testado em Zorin OS 17.3 / base Ubuntu 22.04, LibreOffice 25.2)

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
- `presets/`: sistema de presets de estilo de renderização (ver seção
  "Presets de estilo").
- `src/clipboard.js` e `src/emfExport.js`: cópia da estrutura pro
  clipboard e exportação EMF (ver seção "Copiar e colar no LibreOffice").
- `src/libreOfficeExport.js` e `libreoffice-macro/`: integração por arquivo
  com o LibreOffice (ver seção "Integração por arquivo + macro do
  LibreOffice").

## Presets de estilo

O Ketcher já traz nativamente um botão "Set ACS Settings" nas configurações
(engrenagem no topo) que ajusta os parâmetros pro guia **ACS Document 1996**.
Em vez de reimplementar isso, extraímos os valores exatos que esse botão
aplica (comparando o `ketcher-opts` salvo no `localStorage` antes/depois de
clicar nele) e guardamos como um preset em `presets/acs-1996.json`.

- `presets/manifest.json` lista os presets disponíveis (`id`, `label`,
  arquivo). Adicionar um novo preset é só colocar outro JSON aqui, no mesmo
  formato de `ketcher-opts`, sem precisar tocar em código.
- `src/presets.js` resolve qual preset está ativo (persistido em
  `<userData>/chemdraw-state.json`) e injeta o `ketcher-opts` correspondente
  no `index.html` antes do bundle do Ketcher rodar — o preset já vale desde
  o primeiro carregamento, sem precisar reconfigurar toda vez. **ACS é o
  padrão** numa instalação nova.
- Menu **Estilo** na barra nativa troca entre os presets disponíveis
  (recarrega a janela ao trocar).

## Copiar e colar no LibreOffice

Testado no Zorin OS 17.3 com LibreOffice 25.2 (Writer e Impress), sessão X11.

### O que funciona: PNG via clipboard (padrão)

**Estrutura > Copiar como Imagem (PNG alta resolução)** usa a API nativa
`clipboard.write()` do Electron (com `ClipboardItem`, disponível a partir do
Electron 32) pra colocar um PNG no clipboard do sistema. **Ctrl+V simples
cola corretamente no Writer e no Impress**, como um objeto de imagem, sem
distorcer proporções — validado visualmente nos dois. É o método
recomendado por padrão: não depende de nenhum binário externo, e funciona de
primeira.

### O que não funciona: SVG/EMF via clipboard

**Estrutura > Copiar como Imagem (SVG) para LibreOffice** grava o SVG da
estrutura no clipboard via `xclip -selection clipboard -t image/svg+xml`
(ou `wl-copy -t image/svg+xml` em sessões Wayland — detectado automaticamente
pela presença de `$WAYLAND_DISPLAY`). Confirmamos com `xclip -o` que o dado
chega certinho no clipboard do X11. **Mas o LibreOffice 25.2 não importa
esse mime type** — nem `Ctrl+V` nem `Ctrl+Shift+V` (Colar Especial, que nem
chega a abrir o diálogo) reconhecem `image/svg+xml` vindo do clipboard.
Testamos também gerar um **EMF** (via `soffice --headless --convert-to emf`,
usado internamente pela exportação EMF) e colocá-lo no clipboard com vários
mime types candidatos (`image/x-emf`, `image/emf`, `application/x-emf`,
`application/x-msmetafile`) — nenhum colou. O arquivo EMF gerado é válido
(confirmamos reconvertendo ele pra PNG com o próprio LibreOffice e
comparando visualmente com o original), então o problema é especificamente
no lado do clipboard/paste, não na conversão.

Motivo provável: também testamos a API `ClipboardItem` nativa do próprio
Electron (`clipboard.write([new ClipboardItem({...})])`), que promete
suportar múltiplos mime types simultâneos — só que na prática, no Linux, o
Electron só grava de verdade no clipboard do sistema o `image/png`; mime
types customizados (como `image/svg+xml`) ficam presos no sandbox de
"custom formats" do Chromium e nunca chegam a apps nativos como o
LibreOffice, mesmo aparecendo como presentes quando lidos de volta pelo
próprio Electron.

### Alternativa vetorial: exportar EMF e importar manualmente

Pra quem precisa de um objeto vetorial editável (não só uma imagem estática),
**Estrutura > Exportar como EMF (vetor editável no LibreOffice)...** salva um
arquivo `.emf` (mesmo pipeline SVG → EMF via `soffice --headless`). No
LibreOffice, importe com **Inserir > Imagem** e escolha o arquivo — isso cola
como um objeto vetorial de verdade (dá pra redimensionar sem perder
qualidade). É mais cliques que copiar/colar, mas é a via vetorial que
realmente funciona nesse LibreOffice/Linux, confirmada reconvertendo o EMF
gerado de volta pra PNG e comparando visualmente.

### Resumo

| Método | Cola com Ctrl+V? | Vetorial? | Observação |
|---|---|---|---|
| PNG via clipboard | ✅ Sim (Writer e Impress) | Não | Padrão recomendado |
| SVG via clipboard (xclip/wl-copy) | ❌ Não | — | Dado chega certo no clipboard, LibreOffice não importa |
| EMF via clipboard | ❌ Não (testado com 4 mime types) | — | Mesmo problema |
| EMF via arquivo + Inserir > Imagem | ✅ Sim (import manual) | ✅ Sim | Único caminho vetorial validado |

## Integração por arquivo + macro do LibreOffice (Fase 6)

Como a colagem via clipboard (seção anterior) se mostrou pouco confiável —
principalmente por não ser vetorial de verdade sem um passo manual — a Fase
6 troca isso por um fluxo baseado em arquivo, mais previsível:

1. No ChemDraw Linux: **Estrutura > Exportar para LibreOffice (.ket + .emf)**
   (`Ctrl+E`). Isso salva em `~/.local/share/chemdraw-linux/exports/`:
   - `<id>.ket` — a estrutura no formato nativo do Ketcher, pra reabrir e
     editar depois. `<id>` é um timestamp (`AAAA-MM-DD_HH-MM-SS`).
   - `<id>.emf` — a mesma estrutura em EMF (vetorial), já com a margem
     corrigida (ver Fase 3/commit "Corrige corte nas bordas...").
   - `latest.json` — `{"id", "ket", "emf", "widthMM", "heightMM"}`, sempre
     apontando pra exportação mais recente. A macro do LibreOffice só lê
     esse arquivo, não precisa varrer a pasta.
2. No LibreOffice: a macro **InserirEstruturaQuimica** (ver
   `libreoffice-macro/ChemDrawLinux.bas`) lê `latest.json` e insere o `.emf`
   no documento atual — em Writer, ancorado como caractere na posição do
   cursor; em Impress/Draw, como uma forma no slide atual. A forma inserida
   recebe `Name = <id>`, que é a base pra edição bidirecional (Fase 7).

### Tamanho da imagem inserida

As unidades do SVG que o Ketcher gera **não correspondem a nenhum DPI
fixo** — não são pixels reais de tela. Tentamos duas abordagens que não
funcionaram bem:
- Ler `SizePixel`/`Size100thMM` de volta do gráfico já importado no
  LibreOffice: o importador de SVG do LibreOffice também não assume 96dpi,
  então o tamanho resultante vinha ~4x maior que o esperado.
- Assumir 96dpi nós mesmos ao calcular a partir do SVG: mesmo problema,
  porque a suposição errada é justamente essa.

O que funciona: o ChemDraw Linux fixa uma largura padrão razoável (60mm)
pra estrutura inserida e calcula a altura preservando a proporção
largura/altura do SVG (essa proporção é confiável, mesmo sem saber a escala
real) — grava isso em `widthMM`/`heightMM` no `latest.json`, e a macro usa
esses valores diretamente, sem tentar reintroduzir a escala a partir do
gráfico já inserido.

### Instalar a macro

```bash
./libreoffice-macro/install.sh
```

Copia `ChemDrawLinux.bas` para a biblioteca "Standard" das Minhas Macros do
LibreOffice (feche o LibreOffice antes de rodar). Depois, no LibreOffice:
Ferramentas > Macros > Executar macro > Minhas Macros > Standard >
ChemDrawLinux > `InserirEstruturaQuimica` — ou associe a um atalho de
teclado em Ferramentas > Personalizar > Teclado (procure por
"ChemDrawLinux").

Testado invocando a macro diretamente via linha de comando (mais confiável
que automatizar clique de menu):

```bash
soffice "vnd.sun.star.script:Standard.ChemDrawLinux.InserirEstruturaQuimica?language=Basic&location=application"
```

Validado no Writer (inserido como caractere ancorado, tamanho e proporção
corretos) e no Impress (inserido como forma no slide atual). Empacotar como
extensão `.oxt` instalável com um clique (em vez de rodar o `install.sh`)
fica pra depois, como o roteiro original já previa.

### Edição bidirecional (Fase 7)

Ainda não implementada. A base já está pronta: a forma inserida no
documento tem `Name = <id>`, e existe `<id>.ket` correspondente na pasta de
exports pra reabrir. Falta: a macro "Editar Estrutura Química" (lê o `Name`
da forma selecionada, abre o ChemDraw Linux com esse `.ket`) e "Atualizar
Imagem Selecionada" (substitui só o gráfico da forma já selecionada, sem
duplicar). O ChemDraw Linux já sabe abrir um `.ket` passado por linha de
comando e sobrescrever o mesmo par de arquivos ao exportar de novo (em vez
de gerar um id novo), preparado pra quando essas macros existirem.

## Roteiro

1. ✅ **MVP** — Electron básico embutindo o Ketcher.
2. ✅ **Preset ACS** — parâmetros de renderização (ACS Document 1996).
3. ✅ **Clipboard** — copiar estrutura como PNG (padrão) ou exportar EMF (vetor) pro LibreOffice.
4. **UI customizada** — layout estilo ChemDraw (paleta à esquerda, status bar). _(pulada por enquanto)_
5. **Empacotamento** — AppImage, depois `.deb` e `.rpm`/Flatpak.
6. ✅ **Integração por arquivo + macro do LibreOffice** — botão "Exportar para LibreOffice" (.ket + .emf + latest.json) e macro `InserirEstruturaQuimica`, testados em Writer e Impress. Falta empacotar a macro como extensão `.oxt`.
7. **Edição bidirecional** — macros "Editar Estrutura Química" e "Atualizar Imagem Selecionada", usando o `Name` da forma e o `id` rastreável já implementados. _(próxima)_

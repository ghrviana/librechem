# ChemDraw Linux

Editor de estruturas químicas 2D estilo ChemDraw para Linux (Zorin OS/Ubuntu e
Fedora), construído em cima do [Ketcher](https://github.com/epam/ketcher)
(EPAM, MIT) embutido em uma janela Electron.

> Nome do projeto e licença são provisórios (uso pessoal). Ajustar antes de
> qualquer publicação.

## Status

Fases 1 (MVP), 2 (preset ACS), 3 (clipboard), 6 (integração por arquivo +
macro do LibreOffice, já empacotada como extensão `.oxt` com menu
auto-registrado) e 7 (edição bidirecional, com suporte real a múltiplas
figuras independentes) concluídas e validadas. Fase 4 (UI customizada) foi
pulada por enquanto a pedido do usuário — a integração por arquivo/macro
(Fase 6/7) ficou mais prioritária depois que a colagem via clipboard se
mostrou inconsistente pra estruturas maiores. Falta a Fase 5 (empacotamento
do próprio app ChemDraw Linux: AppImage, depois `.deb`/`.rpm`/Flatpak).

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

### Instalar a macro: extensão `.oxt` (recomendado)

```bash
./libreoffice-macro/oxt/build.sh              # gera dist/ChemDrawLinux.oxt
unopkg add --force dist/ChemDrawLinux.oxt     # feche o LibreOffice antes
```

Empacota `ChemDrawLinux.bas` como uma biblioteca Basic dentro de uma
extensão `.oxt` e registra, via `Addons.xcu`, um menu de topo **"ChemDraw
Linux"** automaticamente — com os 4 itens (Inserir Estrutura, Editar
Estrutura, Atualizar Imagem, Biblioteca de Estruturas) já ligados às
macros correspondentes, tanto no Writer quanto no Impress. Não precisa mais
configurar nada manualmente em Ferramentas > Personalizar depois de
instalar — validado de ponta a ponta (`unopkg add` + inspeção da árvore de
acessibilidade AT-SPI da janela real do LibreOffice, já que não há
ferramenta de screenshot funcional pra diálogos do LibreOffice nesse
ambiente): o menu aparece com os 4 itens certos, e cada item de fato insere
a estrutura no documento.

O `Addons.xcu` restringe onde o menu aparece via a propriedade `Context`
(`com.sun.star.text.TextDocument,com.sun.star.presentation.PresentationDocument`)
— por isso Writer e Impress, não Calc/Draw.

**Se a interface estiver no modo "Abas" (Notebookbar/Tabbed)** — a faixa com
Início/Inserir/Leiaute em vez do menu clássico Arquivo/Editar/Exibir — o
menu "ChemDraw Linux" continua registrado, só que não vira uma aba nova:
ele fica dentro do menu clássico, acessível pelo botão **"Menu"** (ícone ☰
no canto superior direito da faixa). Clicar nele abre a lista completa
(Arquivo, Editar, ..., Ferramentas, **ChemDraw Linux**, Janela, Ajuda).
Confirmado inspecionando via AT-SPI uma janela real nesse modo. Pra ter o
menu como aba de topo direto, mude pra "Barra de Menu Padrão" em Exibir >
Interface do Usuário.

**Gotcha real encontrado testando** (não documentado em lugar nenhum
óbvio): uma biblioteca Basic empacotada num `.oxt` precisa de um
`dialog.xlb` ao lado do `script.xlb`, mesmo que a extensão não tenha
nenhum diálogo `.xdl` salvo (os diálogos deste projeto, como a Biblioteca
de Estruturas, são montados em runtime via `UnoControlDialogModel`, não
`.xdl`). Sem esse arquivo, o carregamento da biblioteca inteira falha
silenciosamente do ponto de vista do menu ("Erro ao carregar o BASIC do
documento .../dialog.xlb: Erro geral de entrada/saída"), e a mensagem de
erro subsequente ("The following Basic script could not be found... 
location: 'application'") engana, parecendo um problema de resolução de
biblioteca/localização quando na verdade é só o `dialog.xlb` ausente. O
`build.sh` já gera um `dialog.xlb` vazio pra evitar isso.

Reinstalar depois de mudar `ChemDrawLinux.bas` ou o `Addons.xcu`: rodar o
`build.sh` de novo e `unopkg add --force` (não precisa reiniciar nada além
do LibreOffice).

### Instalação alternativa (desenvolvimento): `install.sh`

```bash
./libreoffice-macro/install.sh
```

Copia `ChemDrawLinux.bas` direto pra biblioteca "Standard" das Minhas
Macros do LibreOffice (feche o LibreOffice antes de rodar), sem menu
automático — útil só pra iterar rápido na macro sem reempacotar o `.oxt` a
cada mudança. Depois, no LibreOffice: Ferramentas > Macros > Executar macro
> Minhas Macros > Standard > ChemDrawLinux > escolha uma das macros
(`InserirEstruturaQuimica`, `AbrirBibliotecaEstruturas`,
`EditarEstruturaQuimica`, `AtualizarImagemSelecionada`) — ou associe
atalhos de teclado em Ferramentas > Personalizar > Teclado (procure por
"ChemDrawLinux").

Testado invocando a macro diretamente via linha de comando (mais confiável
que automatizar clique de menu):

```bash
soffice "vnd.sun.star.script:Standard.ChemDrawLinux.InserirEstruturaQuimica?language=Basic&location=application"
```

Validado no Writer (inserido como caractere ancorado, tamanho e proporção
corretos) e no Impress (inserido como forma no slide atual).

### Edição bidirecional (Fase 7)

Implementada e validada de ponta a ponta: desenhar → exportar → inserir no
documento → editar → reexportar → atualizar a imagem já colada, sem
duplicar e sem perder posição/tamanho.

- **`open-ket.sh`**: script que o ChemDraw Linux grava (e atualiza) toda vez
  que abre, em `~/.local/share/chemdraw-linux/open-ket.sh` — é como a macro
  sabe relançar o app com um `.ket` específico, sem precisar de um caminho
  fixo hardcoded (útil em dev, onde a pasta do projeto muda).
- **Macro `EditarEstruturaQuimica`**: lê o `Name` (id) da forma selecionada
  no documento, acha `<id>.ket` na pasta de exports e chama `open-ket.sh`
  com esse arquivo via `Shell()`. O ChemDraw Linux abre já com a estrutura
  carregada (precisou esperar `window.ketcher` existir antes de chamar
  `setMolecule` — na primeira tentativa dava erro porque a página "carregada"
  não significa que o Ketcher terminou de inicializar).
- **Reexportar (`Ctrl+E`) durante essa edição**: sobrescreve o mesmo
  `<id>.ket`/`<id>.emf` (usa o id do arquivo que foi aberto), em vez de criar
  um novo — confirmado no diálogo ("Estrutura atualizada (id: ...)").
- **Macro `AtualizarImagemSelecionada`**: com a mesma forma ainda selecionada
  no documento (a inserção agora já deixa a forma selecionada
  automaticamente), troca só a propriedade `Graphic` pelo `<id>.emf`
  atualizado — posição, tamanho e `Name` continuam intocados, e não aparece
  uma segunda imagem.
- Interceptar duplo-clique na imagem (hoje abre as propriedades padrão do
  LibreOffice) continua adiado, como o plano original previa — o fluxo via
  seleção + macro (atalho de teclado ou Ferramentas > Macros) já cobre o
  essencial.

### Biblioteca de Estruturas

`InserirEstruturaQuimica` sempre insere a exportação mais recente
(`latest.json`) — funciona bem pra "desenhei, exporto, colo na hora", mas não
ajuda quando você quer inserir uma estrutura de momentos (ou dias) atrás, ou
inserir a mesma estrutura em documentos diferentes (ex.: uma no Writer, outra
no Impress). A macro **`AbrirBibliotecaEstruturas`** cobre esse caso: abre um
diálogo flutuante dentro do próprio LibreOffice com miniaturas de até 16
estruturas por vez (mais recentes primeiro), com **barra de rolagem
vertical** pra percorrer todo o histórico de exportações — não só as mais
recentes, importante pra trabalhos extensos com muitas estruturas
acumuladas. Clicar numa miniatura insere ela no documento atual e fecha o
diálogo; "Fechar" só fecha sem inserir nada. Parecido com o seletor de
referências do Zotero, mas pra estruturas químicas.

O diálogo cria só os 16 controles de miniatura visíveis por vez (não um
controle por estrutura exportada) — rolar troca o que cada um mostra
(gráfico, rótulo, id), em vez de criar/mover controles. Escala bem mesmo com
centenas de exportações acumuladas, sem deixar o diálogo lento nem maior
que a tela (o tamanho fica sempre o de 16 miniaturas, 4×4; testado com um
altura de janela de 6 linhas antes e ficou alto demais numa tela comum,
invadindo a barra de tarefas — por isso o limite de 4 linhas visíveis).

```bash
soffice "vnd.sun.star.script:Standard.ChemDrawLinux.AbrirBibliotecaEstruturas?language=Basic&location=application"
```

- Cada exportação agora grava também um sidecar `<id>.json` (além do
  `.ket`/`.emf`) com seus próprios `widthMM`/`heightMM` — sem isso, só o
  `latest.json` (sobrescrito a cada `Ctrl+E`) saberia o tamanho de inserção
  certo, e todas as estruturas mais antigas cairiam pro tamanho padrão.
  Exportações feitas antes dessa funcionalidade existir não têm esse
  sidecar; ainda aparecem na biblioteca (a listagem varre os `.ket`, que
  sempre existem), só usam o tamanho padrão em vez do calculado.
- As miniaturas usam `UnoControlImageControlModel` (não um botão comum) por
  causa do `ScaleImage`/`ScaleMode` — só esse controle escala o gráfico de
  verdade pro tamanho da célula; um `UnoControlButtonModel` com `Graphic`
  não redimensiona.
- Validado de ponta a ponta com as 27 estruturas acumuladas nas sessões de
  teste anteriores.

**Distorção de proporção (resolvida)**: usando de verdade, `Atualizar Imagem
Selecionada` e a inserção de estruturas antigas (sem sidecar) esticavam o
desenho fora de proporção. Causas: `AtualizarImagemSelecionada` trocava só o
`Graphic`, mantendo a moldura (`Width`/`Height`) da imagem ANTERIOR — se a
edição mudou a proporção da molécula, a moldura antiga não batia mais; e
`TamanhoDoGrafico` caía num tamanho fixo (80×50mm) quando não havia
`widthMM`/`heightMM` salvo. Corrigido: `AtualizarImagemSelecionada` agora
recalcula a altura (mantendo a largura atual, inclusive se redimensionada
manualmente) usando o `widthMM`/`heightMM` do sidecar; `TamanhoDoGrafico`
usa a proporção do próprio gráfico (`Size100thMM`) como reserva antes do
fallback fixo. Importante: a escala **absoluta** lida de volta do gráfico
não é confiável (~2% de desvio até na proporção, medido na prática, por
causa da conversão SVG→EMF) — por isso sempre prioriza o `widthMM`/`heightMM`
calculado pelo Node.js quando disponível, só usando a razão do gráfico como
último recurso.

### Bugs encontrados usando de verdade com múltiplas figuras (resolvidos)

Validar a Fase 7 só com uma figura por documento escondeu dois bugs
distintos, que só apareceram testando o fluxo real (inserir e editar várias
figuras independentes, em momentos diferentes). Achados por instrumentação
(log na macro e no app) em vez de tentativa e erro — cada um tinha uma causa
bem específica:

**1. `currentExportId` não resetava ao limpar pelo botão do próprio
Ketcher.** `startNewStructure()` (que zera `currentExportId` e recarrega a
janela) só era chamado pelos itens do menu nativo do app ("Novo", "Limpar
Estrutura", trocar preset). O ícone "Clear Canvas" da própria barra de
desenho do Ketcher — o que o usuário realmente usa no dia a dia — não passa
por ali, então o app continuava achando que a próxima exportação era uma
atualização da estrutura anterior, sobrescrevendo o `.ket`/`.emf` errado (o
`Name` já em uso fazia o LibreOffice cair pra um nome automático tipo
`Figura2`, que a macro não reconhece).

Corrigido em `src/main.js` (`watchCanvasCleared`): o app monitora
`window.ketcher.getSmiles()` por polling (a cada 800ms) e, ao detectar a
transição não-vazio → vazio (canvas ficou vazio, não importa qual botão foi
usado pra limpar), avisa o processo principal via IPC
(`chemdraw:canvas-cleared`) pra resetar `currentExportId` — do mesmo jeito
que "Novo"/"Limpar Estrutura" já faziam.

**2. O preview do Ketcher (a "sombra" da forma seguindo o mouse) entrava na
exportação.** Com uma ferramenta de anel/template selecionada, o Ketcher
mostra um preview visual da forma enquanto o mouse passa sobre a área de
desenho — só um efeito visual, nunca deveria virar estrutura de verdade. Só
que `window.ketcher.getKet()` capturava esse preview junto com a estrutura
real sempre que `Ctrl+E` era apertado com o mouse sobre o canvas, exportando
as duas moléculas juntas (confirmado abrindo o `.ket` gerado: tinha `mol0` e
`mol1`; um único `Ctrl+Z` removia as duas de uma vez, e o problema não
acontecia com o mouse fora da área de desenho).

Corrigido em `src/main.js` (`clearHoverPreviewAndWait`): antes de qualquer
leitura de `getKet()` (cópia pro clipboard, exportar EMF, exportar pro
LibreOffice), o app move o mouse de verdade pra fora da área de desenho via
`webContents.sendInputEvent` (evento nativo, não um evento sintético de DOM,
pra garantir que o Ketcher realmente reaja) e espera um instante antes de
ler a estrutura.

Os dois foram encontrados descartando hipóteses por instrumentação — dump de
`getSmiles()` ao longo do tempo, contagem de `GraphicObjects` antes/depois
da inserção, reconversão do `.emf` de volta pra PNG pra inspecionar visualmente,
e inspeção direta do `.ket` gerado — em vez de tentar corrigir "no escuro".
Validado de ponta a ponta com múltiplas figuras inseridas e editadas em
momentos diferentes no mesmo documento.

## Roteiro

1. ✅ **MVP** — Electron básico embutindo o Ketcher.
2. ✅ **Preset ACS** — parâmetros de renderização (ACS Document 1996).
3. ✅ **Clipboard** — copiar estrutura como PNG (padrão) ou exportar EMF (vetor) pro LibreOffice.
4. **UI customizada** — layout estilo ChemDraw (paleta à esquerda, status bar). _(pulada por enquanto)_
5. **Empacotamento** — AppImage, depois `.deb` e `.rpm`/Flatpak.
6. ✅ **Integração por arquivo + macro do LibreOffice** — botão "Exportar para LibreOffice" (.ket + .emf + latest.json) e macro `InserirEstruturaQuimica`, testados em Writer e Impress. ✅ Empacotada como extensão `.oxt` (`libreoffice-macro/oxt/build.sh`) com `Addons.xcu` registrando automaticamente o menu "ChemDraw Linux" (Inserir Estrutura, Editar Estrutura, Atualizar Imagem, Biblioteca de Estruturas) no Writer e no Impress — sem configuração manual em Ferramentas > Personalizar. Ver seção "Instalar a macro: extensão `.oxt`".
7. ✅ **Edição bidirecional** — macros `EditarEstruturaQuimica` e `AtualizarImagemSelecionada`, com suporte real a múltiplas figuras independentes inseridas/editadas em momentos diferentes no mesmo documento (ver seção "Bugs encontrados..." acima), mais a **Biblioteca de Estruturas** (`AbrirBibliotecaEstruturas`) pra inserir qualquer estrutura já exportada, não só a mais recente. Interceptar duplo-clique na imagem continua adiado (o fluxo via seleção + macro já cobre o essencial).

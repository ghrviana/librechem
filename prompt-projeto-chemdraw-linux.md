# Projeto: editor de estruturas químicas 2D estilo ChemDraw para Linux

> **Nota (2026-09-13)**: este é o prompt original do projeto, mantido aqui
> como registro histórico. "ChemDraw" era só a referência de estilo usada
> pra descrever a ideia — o projeto foi batizado oficialmente de
> **LibreChem** (ver README), já que é open source e baseado no Ketcher, não
> uma cópia do ChemDraw (marca registrada da Revvity/PerkinElmer).

## Contexto e objetivo

Quero construir um aplicativo desktop para Linux (Zorin OS/Ubuntu e Fedora) que funcione como um editor de estruturas químicas 2D no estilo do ChemDraw, com:

1. Desenho de estruturas químicas (átomos, ligações, anéis, estereoquímica) com qualidade profissional.
2. Um preset de estilo visual compatível com o guia **ACS Document 1996** (usado por periódicos da American Chemical Society), ativado por padrão.
3. Capacidade de copiar a estrutura desenhada e colar como objeto gráfico no LibreOffice/OpenOffice (Writer e Impress) no Linux.
4. Interface organizada no espírito do ChemDraw: barra de menu, barra de ícones, paleta de ferramentas vertical à esquerda, área de desenho central, barra de status.

Não quero reescrever lógica de química do zero (valência, percepção de anéis, estereoquímica) — quero reaproveitar uma biblioteca open source madura para isso.

## Decisões técnicas já tomadas

- **Motor de química/desenho**: Ketcher (editor 2D open source da EPAM, MIT license), que usa o **Indigo Toolkit** como backend de cheminformática.
- **Empacotamento do desktop**: Electron (ou Tauri, se você avaliar que compensa mais — mas comece com Electron por ter integração mais direta com o Ketcher, que é React/TypeScript).
- **Plataformas alvo**: Zorin OS (base Ubuntu/Debian) e Fedora. Preciso que o app funcione em ambas.
- **Formatos de empacotamento**: comece por **AppImage** (para testar rápido, roda sem instalar). Depois adicione **.deb** (Zorin/Ubuntu) e **.rpm** ou **Flatpak** (Fedora). Use `electron-builder` para gerar os múltiplos alvos a partir do mesmo projeto.

## Requisitos funcionais

### 1. Editor de estruturas
- Embutir o Ketcher dentro de uma janela Electron nativa (sem barra de navegador visível, com menu e ícones customizados por cima).
- Manter as funcionalidades padrão do Ketcher: ligações simples/duplas/triplas, cunhas (wedge/hash), templates de anéis, rótulos de átomos, texto, setas de reação, carga, grupos funcionais comuns.

### 2. Preset de estilo ACS
- Criar um preset de renderização que ajuste os parâmetros do Indigo/Ketcher para se aproximar do guia ACS Document 1996:
  - Comprimento de ligação padrão
  - Espessura das linhas de ligação
  - Fonte e tamanho de fonte dos rótulos de átomo (tipicamente Helvetica/Arial)
  - Proporção e ângulo das cunhas de estereoquímica
- O preset deve poder ser salvo e reaplicado (não precisa reconfigurar toda vez).
- Se o Indigo/Ketcher não expuser algum desses parâmetros diretamente, pesquise a documentação da API de configuração de renderização deles antes de assumir que não é possível.
- Deixe a porta aberta para eu adicionar outros presets no futuro (não hardcode só o ACS).

### 3. Copiar e colar no LibreOffice/OpenOffice
- Ao copiar uma estrutura selecionada, gerar a representação em **SVG** e colocar no clipboard do sistema com o mime type `image/svg+xml`, usando `xclip` (sessões X11) ou `wl-copy` (sessões Wayland) — detecte automaticamente qual está em uso.
- Implementar fallback em **PNG** de alta resolução, caso a colagem de SVG não funcione bem no LibreOffice.
- Testar colagem simples (Ctrl+V) e "Colar especial" no LibreOffice Writer e Impress.
- Se o SVG não colar como objeto vetorial editável, pesquisar conversão para **EMF** (via Cairo ou librsvg) como alternativa, já que o LibreOffice importa EMF nativamente.
- Documentar no README qual método funcionou melhor e por quê.

### 4. Interface (estilo ChemDraw)
- Barra de menu no topo: Arquivo, Editar, Ver, Estrutura, Texto, Cor, Janela.
- Barra de ícones abaixo do menu: novo, abrir, salvar, desfazer/refazer, zoom in/out, "limpar estrutura", e um seletor do preset de estilo ativo (ex.: "ACS Document 1996").
- Paleta de ferramentas vertical à esquerda: seleção, mover tela, ligações (simples/dupla/tripla/cunha/hash), templates de anel (hexágono, pentágono), rótulo de átomo, carga, texto, seta, borracha.
- Área de desenho central em fundo branco, ocupando o espaço restante.
- Barra de status inferior: fórmula molecular e massa molecular da estrutura atual, nível de zoom.
- Priorize reorganizar os componentes existentes do Ketcher para bater com esse layout, em vez de recriar o editor do zero.

## Atualização: colagem via clipboard está inconsistente

O clipboard entre o Electron e o LibreOffice no Linux só está colando SVG/EMF de forma inconsistente. Vamos substituir (ou complementar) esse fluxo por um baseado em arquivo, que é mais confiável:

### 5. Botão "Exportar para LibreOffice" no app de desenho
- Salvar a estrutura no formato nativo do Ketcher (`.ket`) em uma pasta do projeto, para permitir reabrir/editar depois.
- Exportar a mesma estrutura como EMF para uma pasta dedicada, ex.: `~/.local/share/chemapp/exports/`.
- Nomear o arquivo com timestamp completo (ano-mês-dia_hora-min-seg) para rastreabilidade, ex.: `estrutura_2026-09-11_14-32-07.emf`.
- Além do arquivo com timestamp, **sobrescrever também um arquivo de nome fixo `latest.emf`** na mesma pasta — isso evita que a macro do LibreOffice precise varrer a pasta comparando datas de modificação; ela sempre lê `latest.emf` diretamente.

### 6. Macro/extensão no LibreOffice para inserir a estrutura
- Comece com uma macro Basic (ou Python) via API UNO, associada a um atalho de teclado ou botão de barra de ferramentas, que insere `latest.emf` como imagem na posição atual do cursor (`insertGraphicObject` ou `.uno:InsertGraphic` via dispatcher).
- Teste separadamente no Writer e no Impress, já que a inserção pelo cursor se comporta diferente entre os dois.
- Depois de validar que funciona bem, empacotar como uma extensão `.oxt` instalável com um clique, em vez de depender de copiar a macro manualmente em cada máquina.
- Deixar claro que a imagem inserida é um gráfico estático (não formas vetoriais editáveis no LibreOffice) — mesma limitação que o clipboard-paste já teria.

### 7. Edição bidirecional (ida e volta) da estrutura colada no documento

O objetivo é poder selecionar uma estrutura já colada no LibreOffice e reabri-la no editor 2D para corrigir, sem criar uma cópia nova nem perder a posição/tamanho no documento.

- **Identificação**: ao exportar, gerar um ID único (o próprio timestamp serve) e salvar `id.ket` + `id.emf` na pasta de exportação, junto com um `latest.json` do tipo `{"id": "...", "ket": "caminho/id.ket", "emf": "caminho/id.emf"}`. Isso substitui o `latest.emf` simples da seção 5 — agora precisamos do ID rastreável, não só do arquivo mais recente.
- **Marcação no documento**: a macro de inserção (seção 6) deve, ao inserir o EMF, atribuir esse ID à propriedade `Name` da forma/imagem inserida no LibreOffice. Essa propriedade é nativa do LibreOffice e persiste ao salvar em `.odt`/`.odp`.
- **Macro "Editar estrutura química"**: com a imagem selecionada no documento, lê o `Name` da forma, localiza o `id.ket` correspondente na pasta de exportação, e abre o app de desenho já carregado com esse arquivo.
- **Salvar de volta**: ao salvar no app de desenho durante essa edição, sobrescrever o mesmo par `id.ket`/`id.emf` — não gerar um ID novo.
- **Macro "Atualizar imagem selecionada"**: de volta no LibreOffice, com a mesma imagem ainda selecionada, substitui apenas o conteúdo gráfico da forma (mantendo posição, tamanho e o `Name`) pelo `id.emf` atualizado — sem inserir uma cópia nova.
- Interceptar o duplo-clique real na imagem (hoje abre as propriedades padrão do LibreOffice) é um refinamento mais avançado — deixar para depois. Um atalho de teclado ou botão de barra de ferramentas com a imagem selecionada já cobre o essencial.

## Fases de desenvolvimento sugeridas

1. **MVP**: Electron básico embutindo o Ketcher, rodando e desenhando corretamente no Zorin OS.
2. **Preset ACS**: configurar e validar visualmente os parâmetros de renderização.
3. **Clipboard**: implementar exportação SVG/PNG e validar colagem real no LibreOffice.
4. ~~**UI customizada**: aplicar o layout estilo ChemDraw (menu, toolbar, paleta, status bar).~~ **Retirada do plano em definitivo** (decisão de 2026-09-13): a UI nativa do Ketcher já é boa o suficiente, e reimplementá-la custom só criaria risco de quebrar a cada atualização do Ketcher sem ganho real — a mudança no botão de Texto do menu nativo já resolveu o que essa fase tentava cobrir.
5. **Empacotamento**: gerar AppImage, depois .deb e .rpm/Flatpak; validar instalação em Fedora (pode ser via VM se eu não tiver uma máquina Fedora física ainda).
6. **Integração via arquivo + macro do LibreOffice**: implementar o botão "Exportar para LibreOffice" (native + EMF com timestamp + `latest.emf`), depois a macro de inserção, testar em Writer e Impress, e só então empacotar como extensão `.oxt`.
7. **Edição bidirecional**: trocar `latest.emf` por `latest.json` com ID rastreável, marcar a imagem inserida com `Name = id`, criar as macros "Editar estrutura química" e "Atualizar imagem selecionada", e testar o ciclo completo: desenhar → colar → selecionar → editar → salvar → atualizar no documento.

Vá fase por fase, mostre o resultado de cada uma antes de avançar para a próxima, e não avance para o empacotamento final antes de eu validar que o desenho, o preset ACS e a colagem no LibreOffice estão funcionando bem.

## Critérios de aceite

- O app abre e desenha estruturas corretamente no Zorin OS.
- O preset ACS produz um resultado visualmente consistente com estruturas publicadas em periódicos ACS (posso fornecer exemplos de referência).
- Uma estrutura copiada do app cola no LibreOffice Writer como imagem, sem distorcer proporções.
- A paleta de ferramentas e os menus batem com a disposição combinada (posso fornecer um mockup de referência).
- O AppImage gerado roda sem erros em uma instalação limpa do Zorin.

## Perguntas para você confirmar comigo antes de decisões irreversíveis

- Nome do aplicativo e licença (pretendo deixar como projeto pessoal/uso próprio, mas confirme antes de publicar em qualquer lugar).
- Se surgir alguma limitação técnica do Ketcher/Indigo que impeça algum requisito acima (ex.: algum parâmetro de estilo ACS não configurável), me avise antes de assumir uma solução alternativa.

## Meu ambiente

- Sistema operacional principal: Zorin OS (base Ubuntu).
- Vou testar Fedora depois, possivelmente em uma VM.
- Suíte de escritório usada para colagem: LibreOffice (verificar se já está instalado; se o comando for `soffice`, está tudo certo).
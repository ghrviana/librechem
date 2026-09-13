# LibreChem

Editor de estruturas químicas 2D estilo ChemDraw para Linux, com integração
nativa com o LibreOffice (Writer e Impress). Construído em cima do
[Ketcher](https://github.com/epam/ketcher) (EPAM, MIT) embutido em uma janela
Electron, com um menu próprio dentro do LibreOffice pra inserir, editar e
reutilizar estruturas químicas nos seus documentos.

Testado em Zorin OS 17.3 (base Ubuntu 22.04) com LibreOffice 25.2.

## Índice

- [O que é](#o-que-é)
- [Instalação](#instalação)
- [Fluxo de uso](#fluxo-de-uso)
- [Biblioteca de Estruturas: onde fica e como fazer backup](#biblioteca-de-estruturas-onde-fica-e-como-fazer-backup)
- [Presets de estilo (ACS 1996)](#presets-de-estilo-acs-1996)
- [Requisitos](#requisitos)
- [Rodando a partir do código-fonte](#rodando-a-partir-do-código-fonte)
- [Como funciona por baixo dos panos](#como-funciona-por-baixo-dos-panos)
- [Limitações conhecidas](#limitações-conhecidas)
- [Licença](#licença)

## O que é

O LibreOffice não tem um editor de estruturas químicas decente — a saída
usual é desenhar em outro programa (ChemDraw, MarvinSketch...) e colar uma
imagem estática, difícil de editar depois. O LibreChem resolve isso pro
Linux: é um app de desenho 2D de moléculas (a mesma ferramenta usada por
sites como PubChem) que se integra ao Writer e ao Impress por um menu
próprio, permitindo:

- Desenhar uma estrutura e inserir ela no documento com poucos cliques.
- Reabrir e editar uma estrutura já inserida sem precisar redesenhar do
  zero.
- Reaproveitar estruturas já desenhadas antes (a **Biblioteca de
  Estruturas**), em qualquer documento.
- Manter tudo como vetor (EMF) — redimensiona sem perder qualidade, ao
  contrário de colar um PNG.

## Instalação

Baixe o pacote correspondente à sua distribuição na página de
[Releases](../../releases):

| Distribuição | Pacote |
|---|---|
| Ubuntu, Zorin OS, Debian e derivados | `.deb` |
| Fedora, openSUSE e derivados | `.rpm` |
| Qualquer distro Linux x86_64 | `.AppImage` (não precisa instalar nada) |

**`.deb`/`.rpm`**: instale normalmente (ex.: `sudo apt install ./librechem_*.deb`
ou `sudo dnf install ./librechem-*.rpm`). O instalador já registra sozinho a
integração com o LibreOffice pra todos os usuários da máquina — não precisa
nenhum passo manual. Se o LibreOffice for instalado depois do LibreChem,
repita a instalação do pacote (ou veja o passo manual do AppImage abaixo,
que funciona igual).

**`.AppImage`**: baixe, dê permissão de execução (`chmod +x
LibreChem-*.AppImage`) e rode. Como AppImage não tem etapa de instalação, a
integração com o LibreOffice precisa ser registrada manualmente uma única
vez:

```bash
./LibreChem-*.AppImage --appimage-extract
unopkg add --force squashfs-root/resources/LibreChem.oxt
```

(Repita esse passo só se atualizar pra uma versão nova do AppImage.) Feche e
reabra o LibreOffice depois de instalar a extensão pra ver o menu
**LibreChem** aparecer.

## Fluxo de uso

Exemplo completo, do desenho até o documento pronto:

### 1. Desenhar a estrutura

Abra o LibreChem e desenhe a molécula usando a paleta do Ketcher (átomos,
ligações, anéis, templates — tudo na barra do próprio app).

### 2. Exportar pro LibreOffice

Com a estrutura pronta, use **Estrutura > Exportar para LibreOffice (.ket +
.emf)**, ou simplesmente o atalho **Ctrl+E**. Isso não abre nenhum diálogo —
só salva a estrutura (em formato editável `.ket` e em vetor `.emf`) numa
pasta local que o LibreOffice vai ler depois. Um aviso rápido confirma que
exportou.

### 3. Inserir no documento

Abra (ou vá até) o **Writer ou o Impress** onde a estrutura deve entrar.
No menu do LibreOffice, clique em **LibreChem > Inserir Estrutura**.

> Se o LibreOffice estiver no modo clássico de menus (Arquivo, Editar, Exibir...),
> "LibreChem" aparece como um item de menu de topo, igual aos outros.
> Se estiver no modo "Abas"/Notebookbar (a faixa com Início, Inserir, Leiaute...),
> abra o botão **☰ Menu** no canto superior direito da faixa — "LibreChem"
> aparece lá dentro, junto com Arquivo/Editar/etc.

A estrutura mais recente exportada (a que você acabou de fazer no passo 2)
é inserida na posição do cursor (Writer) ou no slide atual (Impress), já no
tamanho certo e como imagem vetorial.

### 4. Editar uma estrutura já inserida

Mudou de ideia, ou precisa corrigir algo numa estrutura que já está no
documento?

1. **Clique na imagem** da estrutura pra selecioná-la.
2. Vá em **LibreChem > Editar Estrutura**.
3. O LibreChem abre sozinho já com aquela estrutura carregada no canvas —
   edite normalmente.
4. Termine com **Ctrl+E** de novo (isso atualiza a mesma exportação, não
   cria uma nova).
5. Volte ao LibreOffice. Com a mesma imagem **ainda selecionada**, vá em
   **LibreChem > Atualizar Imagem**. A imagem antiga no documento é
   substituída pela versão editada, mantendo posição e tamanho — sem
   duplicar nada.

### 5. Reutilizar uma estrutura de outro momento

Pra inserir uma estrutura desenhada há dias (não a última) ou reaproveitar a
mesma estrutura em outro documento, use **LibreChem > Biblioteca de
Estruturas** em vez de "Inserir Estrutura". Abre uma janela com miniaturas
de todas as estruturas já exportadas (rolagem pra ver o histórico
completo) — clique na desejada pra inserir no documento atual.

## Biblioteca de Estruturas: onde fica e como fazer backup

Todo o histórico de estruturas exportadas (os arquivos que alimentam
"Inserir Estrutura", "Editar Estrutura" e a "Biblioteca de Estruturas") fica
guardado **só nessa máquina**, em `~/.local/share/librechem/exports/`. Isso
é importante por dois motivos:

- **Não sincroniza sozinho entre computadores.** Se você trabalha em mais
  de uma máquina (ex.: casa e trabalho), uma estrutura desenhada numa
  máquina não aparece na Biblioteca de Estruturas da outra, a não ser que
  você transfira manualmente.
- **É o que permite editar depois.** A imagem colada no documento
  (`.emf`) é só o resultado final; quem guarda a estrutura *editável* é o
  arquivo `.ket` correspondente, nessa pasta local. Se essa pasta se
  perder (reinstalação do sistema, troca de máquina sem backup, etc.), as
  estruturas já coladas continuam aparecendo nos documentos normalmente,
  mas **deixam de poder ser editadas** pelo LibreChem — só dariam pra
  redesenhar do zero.

Por isso, faça backup (ou leve pra outra máquina) usando o menu **Estrutura
> Biblioteca de Estruturas** dentro do próprio LibreChem (esse menu fica no
LibreChem, não no LibreOffice):

- **Exportar Biblioteca de Estruturas (.zip)...** — empacota tudo num único
  `.zip`. Guarde esse arquivo como backup, ou leve pra outra máquina com
  LibreChem instalado.
- **Importar Biblioteca de Estruturas (.zip)...** — pega um `.zip` gerado
  pela opção acima e junta com a biblioteca local, sem sobrescrever nada já
  existente. Depois de importar, as estruturas aparecem na Biblioteca de
  Estruturas normalmente.
- **Limpar Histórico de Exportações...** — apaga tudo (ação sem desfazer).
  Pede confirmação e oferece exportar um backup automático antes de
  limpar.

Recomendação prática: exporte um `.zip` de backup periodicamente (ou antes
de formatar/trocar de máquina), do mesmo jeito que faria backup de qualquer
outra pasta de trabalho importante.

## Presets de estilo (ACS 1996)

O LibreChem já sobe configurado com o preset **ACS Document 1996** (o
padrão de formatação de estrutura química mais usado em publicações), então
não precisa configurar nada pra desenhar de acordo com esse guia. Dá pra
trocar de preset pelo menu **Estilo** na barra do app.

## Requisitos

- Linux x86_64 (testado em Zorin OS 17.3 / base Ubuntu 22.04)
- LibreOffice (Writer e/ou Impress) — necessário pra integração; o app
  também abre sem o LibreOffice instalado, só sem os menus de inserir/editar
- `zip`/`unzip` — usados pelos recursos de exportar/importar a Biblioteca de
  Estruturas (já vêm por padrão na maioria das distros)

## Rodando a partir do código-fonte

Pra quem quiser contribuir ou rodar sem os pacotes prontos:

```bash
npm install        # instala deps e baixa o build do Ketcher (postinstall)
npm start           # abre o app
```

Gerar os pacotes instaláveis (via [electron-builder](https://www.electron.build/)):

```bash
npm run dist:appimage   # release/LibreChem-<versão>.AppImage
npm run dist:deb        # release/librechem_<versão>_amd64.deb
npm run dist:rpm        # release/librechem-<versão>.x86_64.rpm (precisa do rpmbuild no sistema)
npm run dist:all        # os três de uma vez
```

Cada um desses já gera a extensão `.oxt` do LibreOffice antes de empacotar,
então o pacote final já sai com a integração embutida.

Instalando a integração com o LibreOffice manualmente, em modo
desenvolvimento (sem gerar pacote):

```bash
./libreoffice-macro/oxt/build.sh          # gera dist/LibreChem.oxt
unopkg add --force dist/LibreChem.oxt     # feche o LibreOffice antes
```

## Como funciona por baixo dos panos

- **App Electron** (`src/main.js`) embute o Ketcher (build standalone,
  baixado dos releases oficiais). As ferramentas de desenho, texto e cor são as do próprio
  Ketcher — decisão deliberada, pra não arriscar quebrar uma UI customizada
  a cada atualização do Ketcher.
- **Exportar (Ctrl+E)**: salva a estrutura em `~/.local/share/librechem/exports/`
  em dois formatos — `.ket` (editável, formato nativo do Ketcher) e `.emf`
  (vetorial, o que de fato entra no documento) — junto com metadados de
  tamanho.
- **Extensão `.oxt` do LibreOffice** (`libreoffice-macro/`): empacota uma
  macro Basic que lê essas exportações e insere/atualiza a imagem no
  documento. Registra o menu **LibreChem** automaticamente no Writer e no
  Impress via `Addons.xcu` — sem precisar configurar nada manualmente em
  Ferramentas > Personalizar.
- **Edição bidirecional**: cada imagem inserida guarda um identificador
  (`Name`) que aponta de volta pro `.ket` correspondente, permitindo reabrir
  a estrutura original a partir da imagem já colada no documento.

<details>
<summary>Detalhes técnicos adicionais (clipboard, EMF, bugs de múltiplas figuras)</summary>

### Por que arquivo em vez de copiar/colar

Testamos primeiro copiar a estrutura direto pro clipboard do sistema.
**PNG funciona** (`Estrutura > Copiar como Imagem`, Ctrl+V cola normal em
Writer/Impress), mas não é vetorial. **SVG e EMF via clipboard não
funcionam** nesse LibreOffice/Linux — o LibreOffice não importa esses mime
types vindos do clipboard, mesmo confirmando que o dado chega certo (via
`xclip -o`) e que o arquivo EMF gerado é válido. Por isso o fluxo principal
do app é por arquivo (`.ket`/`.emf` + macro), que é vetorial de verdade e
não depende desse comportamento do clipboard. Copiar como PNG continua
disponível como atalho rápido pra quem só precisa de uma imagem estática.

### Tamanho da imagem inserida

As unidades do SVG que o Ketcher gera não correspondem a nenhum DPI fixo, e
tanto o LibreOffice quanto assumir 96dpi na mão davam tamanho ~4x maior que
o esperado. Solução: o LibreChem calcula a largura/altura reais (em mm) no
momento da exportação e grava nos metadados; a macro usa esse valor direto,
sem tentar redescobrir a escala a partir da imagem já inserida.

### Bugs de múltiplas figuras (resolvidos)

Dois bugs só apareceram testando várias figuras independentes no mesmo
documento:

1. **Limpar o canvas pelo botão do próprio Ketcher** não resetava o
   identificador de exportação interno do app (só os itens do menu nativo
   do app resetavam) — a exportação seguinte sobrescrevia a estrutura
   errada. Corrigido monitorando a transição do canvas pra vazio via
   polling, não só os menus do app.
2. **O preview visual do Ketcher** (a "sombra" de uma forma seguindo o
   mouse com uma ferramenta de anel/template selecionada) podia ser
   capturado junto com a estrutura real ao exportar, se o mouse estivesse
   sobre a área de desenho no momento do Ctrl+E. Corrigido movendo o mouse
   pra fora da área de desenho antes de ler a estrutura pra exportação.

</details>

## Limitações conhecidas

- Testado em Zorin OS/Ubuntu; instalação real do `.deb`/`.rpm` em Fedora
  ainda não validada nessa máquina (o `.rpm` é gerado e o script de
  pós-instalação foi conferido, mas falta testar a instalação de fato).
- Não há empacotamento Flatpak por enquanto (a sandbox do Flatpak dificulta
  a integração automática com o LibreOffice do sistema).
- Duplo-clique numa estrutura já inserida abre as propriedades padrão de
  imagem do LibreOffice, não a edição da estrutura — use o fluxo de seleção
  + menu **LibreChem > Editar Estrutura** descrito acima.
- A Biblioteca de Estruturas é local por máquina (ver seção de backup
  acima).

## Licença

[MIT](LICENSE). O [Ketcher](https://github.com/epam/ketcher), usado como
motor de desenho, também é MIT (EPAM Systems).

REM ChemDraw Linux — integração por arquivo com o LibreOffice (Fase 6/7).
REM
REM Lê ~/.local/share/chemdraw-linux/exports/latest.json (escrito pelo app
REM ChemDraw Linux ao usar Estrutura > Exportar para LibreOffice) e insere o
REM .emf correspondente no documento atual (Writer ou Impress/Draw),
REM marcando a forma inserida com Name = id — isso é o que permite reabrir
REM a estrutura depois (macro EditarEstruturaQuimica) e atualizar a imagem
REM já colada sem duplicar (macro AtualizarImagemSelecionada).
REM
REM Instalação: copiar este módulo para a biblioteca "Standard" das Minhas
REM Macros (~/.config/libreoffice/4/user/basic/Standard/) ou importar via
REM Ferramentas > Macros > Editar Macros > arquivo > Importar.

REM Referência ao diálogo da Biblioteca de Estruturas enquanto ele está
REM aberto — os listeners de clique (ChemDrawLibImg_*/ChemDrawLibFechar_*)
REM precisam dela pra fechar o diálogo (endExecute) quando o usuário clica
REM numa miniatura ou em "Fechar".
Dim goBibliotecaDialog As Object

Function ChemDrawExportDir() As String
    ChemDrawExportDir = Environ("HOME") & "/.local/share/chemdraw-linux/exports"
End Function

REM Script que o app grava a cada vez que abre, pra dizer pra gente como
REM relançar ele mesmo com um .ket específico (ver ensureLauncherScript em
REM src/libreOfficeExport.js).
Function ChemDrawLauncherPath() As String
    ChemDrawLauncherPath = Environ("HOME") & "/.local/share/chemdraw-linux/open-ket.sh"
End Function

Function LerArquivoComoTexto(sPath As String) As String
    Dim iFile As Integer
    Dim sLinha As String
    Dim sConteudo As String
    iFile = FreeFile
    Open sPath For Input As #iFile
    Do While Not EOF(iFile)
        Line Input #iFile, sLinha
        sConteudo = sConteudo & sLinha & Chr(10)
    Loop
    Close #iFile
    LerArquivoComoTexto = sConteudo
End Function

REM Extrai o valor de uma chave string simples de um JSON "achatado" tipo
REM {"id": "...", "ket": "..."} — não é um parser de JSON geral, só o
REM suficiente pro formato fixo que o ChemDraw Linux escreve.
Function ExtrairValorJson(sJson As String, sChave As String) As String
    Dim sPadrao As String
    Dim iInicio As Long
    Dim iFim As Long

    sPadrao = """" & sChave & """: """
    iInicio = InStr(sJson, sPadrao)
    If iInicio = 0 Then
        ExtrairValorJson = ""
        Exit Function
    End If

    iInicio = iInicio + Len(sPadrao)
    iFim = InStr(iInicio, sJson, """")
    ExtrairValorJson = Mid(sJson, iInicio, iFim - iInicio)
End Function

REM Mesma ideia, mas pra um valor numérico sem aspas (ex.: "widthMM": 259.3).
REM Val() é usado em vez de CDbl() porque não depende da localidade do
REM sistema pro separador decimal (JSON sempre usa ponto).
Function ExtrairValorJsonNumero(sJson As String, sChave As String) As Double
    Dim sPadrao As String
    Dim iInicio As Long, iFim As Long
    Dim iVirgula As Long, iChave As Long, iQuebra As Long

    sPadrao = """" & sChave & """: "
    iInicio = InStr(sJson, sPadrao)
    If iInicio = 0 Then
        ExtrairValorJsonNumero = 0
        Exit Function
    End If
    iInicio = iInicio + Len(sPadrao)

    iVirgula = InStr(iInicio, sJson, ",")
    iChave = InStr(iInicio, sJson, "}")
    iQuebra = InStr(iInicio, sJson, Chr(10))

    iFim = 0
    If iVirgula > 0 Then iFim = iVirgula
    If iChave > 0 And (iFim = 0 Or iChave < iFim) Then iFim = iChave
    If iQuebra > 0 And (iFim = 0 Or iQuebra < iFim) Then iFim = iQuebra
    If iFim = 0 Then iFim = Len(sJson) + 1

    ExtrairValorJsonNumero = Val(Trim(Mid(sJson, iInicio, iFim - iInicio)))
End Function

Function CarregarGrafico(sPath As String) As Object
    Dim oProvider As Object
    Dim oArgs(0) As New com.sun.star.beans.PropertyValue
    oProvider = createUnoService("com.sun.star.graphic.GraphicProvider")
    oArgs(0).Name = "URL"
    oArgs(0).Value = ConvertToURL(sPath)
    CarregarGrafico = oProvider.queryGraphic(oArgs())
End Function

REM Lê latest.json e devolve um array (id, .ket, .emf, larguraMM, alturaMM).
REM Mostra um aviso e devolve id vazio se ainda não houver nenhuma exportação.
Function LerUltimaExportacao() As Variant
    Dim sJsonPath As String
    Dim sJson As String
    Dim aResultado(4) As Variant

    sJsonPath = ChemDrawExportDir() & "/latest.json"

    If Not FileExists(sJsonPath) Then
        MsgBox "Nenhuma estrutura exportada ainda." & Chr(10) & _
               "No ChemDraw Linux, use Estrutura > Exportar para LibreOffice primeiro.", _
               64, "ChemDraw Linux"
        LerUltimaExportacao = Array("", "", "", 0, 0)
        Exit Function
    End If

    sJson = LerArquivoComoTexto(sJsonPath)
    aResultado(0) = ExtrairValorJson(sJson, "id")
    aResultado(1) = ExtrairValorJson(sJson, "ket")
    aResultado(2) = ExtrairValorJson(sJson, "emf")
    aResultado(3) = ExtrairValorJsonNumero(sJson, "widthMM")
    aResultado(4) = ExtrairValorJsonNumero(sJson, "heightMM")
    LerUltimaExportacao = aResultado
End Function

REM Mesma ideia de LerUltimaExportacao, mas pro sidecar <id>.json de uma
REM exportação específica (não necessariamente a mais recente) — é o que
REM permite a Biblioteca de Estruturas inserir qualquer estrutura já
REM exportada, não só a última. aResultado(0) vem vazio se o sidecar não
REM existir (ex.: exportações antigas, de antes dessa funcionalidade
REM existir, não têm <id>.json).
Function LerExportacaoPorId(sId As String) As Variant
    Dim sJsonPath As String
    Dim sJson As String
    Dim aResultado(4) As Variant

    sJsonPath = ChemDrawExportDir() & "/" & sId & ".json"
    If Not FileExists(sJsonPath) Then
        aResultado(0) = ""
        LerExportacaoPorId = aResultado
        Exit Function
    End If

    sJson = LerArquivoComoTexto(sJsonPath)
    aResultado(0) = ExtrairValorJson(sJson, "id")
    aResultado(1) = ExtrairValorJson(sJson, "ket")
    aResultado(2) = ExtrairValorJson(sJson, "emf")
    aResultado(3) = ExtrairValorJsonNumero(sJson, "widthMM")
    aResultado(4) = ExtrairValorJsonNumero(sJson, "heightMM")
    LerExportacaoPorId = aResultado
End Function

REM Lista os ids de TODAS as exportações já feitas (varre .ket, que sempre
REM existe, não só as que têm sidecar <id>.json — senão exportações
REM anteriores à Biblioteca de Estruturas existir ficariam invisíveis),
REM mais recente primeiro (ids são "AAAA-MM-DD_HH-MM-SS", então ordenação de
REM texto já é ordenação cronológica). Devolve um array vazio (UBound = -1)
REM se não houver nenhuma.
Function ListarExportacoes() As Variant
    Dim sDir As String
    Dim sArquivo As String
    Dim aIds() As String
    Dim nCount As Integer
    Dim i As Integer, j As Integer
    Dim sTemp As String
    Dim aResultado() As Variant

    sDir = ChemDrawExportDir()
    nCount = 0
    ReDim aIds(500)

    sArquivo = Dir(sDir & "/*.ket")
    Do While sArquivo <> ""
        aIds(nCount) = Left(sArquivo, Len(sArquivo) - 4) ' remove ".ket"
        nCount = nCount + 1
        sArquivo = Dir()
    Loop

    REM Ordenação por seleção (nCount é pequeno, não precisa de nada mais esperto).
    For i = 0 To nCount - 2
        For j = i + 1 To nCount - 1
            If aIds(j) > aIds(i) Then
                sTemp = aIds(i)
                aIds(i) = aIds(j)
                aIds(j) = sTemp
            End If
        Next j
    Next i

    If nCount = 0 Then
        ListarExportacoes = Array()
        Exit Function
    End If

    ReDim aResultado(nCount - 1)
    For i = 0 To nCount - 1
        aResultado(i) = aIds(i)
    Next i
    ListarExportacoes = aResultado
End Function

REM Converte "2026-09-12_09-21-05" em "12/09 09:21", pro rótulo embaixo de
REM cada miniatura na Biblioteca de Estruturas.
Function FormatarRotuloId(sId As String) As String
    If Len(sId) < 19 Then
        FormatarRotuloId = sId
        Exit Function
    End If
    FormatarRotuloId = Mid(sId, 9, 2) & "/" & Mid(sId, 6, 2) & " " & Mid(sId, 12, 2) & ":" & Mid(sId, 15, 2)
End Function

REM Tamanho em 1/100mm. Prioriza o widthMM/heightMM calculado pelo próprio
REM ChemDraw Linux (a partir do SVG original, a 96dpi) — tentar ler de volta
REM o tamanho "real" do gráfico já importado (SizePixel/Size100thMM) dá
REM valores errados, porque o importador de SVG do LibreOffice não assume
REM 96dpi pras unidades sem sufixo do SVG.
REM oGrafico é opcional: usado só como reserva quando não há
REM widthMM/heightMM confiável (ex.: exportações de antes da Biblioteca de
REM Estruturas existir, sem sidecar <id>.json). A escala ABSOLUTA lida de
REM volta de Size100thMM não é confiável (a conversão SVG→EMF introduz um
REM desvio de ~2% na própria proporção, medido na prática), mas ainda assim
REM é muito melhor que um tamanho fixo arbitrário quando é tudo que se tem.
Function TamanhoDoGrafico(dWidthMM As Double, dHeightMM As Double, Optional oGrafico As Object) As Object
    Dim oSize As New com.sun.star.awt.Size
    Dim oTamGrafico As Object
    Dim dRazao As Double

    If dWidthMM > 0 And dHeightMM > 0 Then
        oSize.Width = Int(dWidthMM * 100)
        oSize.Height = Int(dHeightMM * 100)
        TamanhoDoGrafico = oSize
        Exit Function
    End If

    If Not IsMissing(oGrafico) Then
        On Error Resume Next
        oTamGrafico = oGrafico.Size100thMM
        If Not IsNull(oTamGrafico) And oTamGrafico.Width > 0 And oTamGrafico.Height > 0 Then
            dRazao = oTamGrafico.Height / oTamGrafico.Width
            oSize.Width = 6000 ' 60mm padrão, mesma largura que o ChemDraw Linux usa por padrão
            oSize.Height = Int(6000 * dRazao)
            TamanhoDoGrafico = oSize
            Exit Function
        End If
        On Error GoTo 0
    End If

    oSize.Width = 8000
    oSize.Height = 5000
    TamanhoDoGrafico = oSize
End Function

REM ------------------------------------------------------------------
REM Inserir Estrutura Química: insere latest.emf no documento atual.
REM ------------------------------------------------------------------
Sub InserirEstruturaQuimica
    Dim aExportacao As Variant
    Dim sId As String, sEmf As String
    Dim dWidthMM As Double, dHeightMM As Double

    aExportacao = LerUltimaExportacao()
    sId = aExportacao(0)
    sEmf = aExportacao(2)
    dWidthMM = aExportacao(3)
    dHeightMM = aExportacao(4)
    If sId = "" Then Exit Sub

    InserirEstruturaPorId(sId, sEmf, dWidthMM, dHeightMM)
End Sub

REM Lógica de inserção compartilhada entre InserirEstruturaQuimica (sempre a
REM exportação mais recente) e a Biblioteca de Estruturas (qualquer
REM exportação passada, escolhida pelo usuário).
Sub InserirEstruturaPorId(sId As String, sEmf As String, dWidthMM As Double, dHeightMM As Double)
    If ThisComponent.supportsService("com.sun.star.text.TextDocument") Then
        InserirNoWriter(sEmf, sId, dWidthMM, dHeightMM)
    ElseIf ThisComponent.supportsService("com.sun.star.presentation.PresentationDocument") _
        Or ThisComponent.supportsService("com.sun.star.drawing.DrawingDocument") Then
        InserirNoImpressOuDraw(sEmf, sId, dWidthMM, dHeightMM)
    Else
        MsgBox "Tipo de documento não suportado. Use Writer, Impress ou Draw.", 48, "ChemDraw Linux"
    End If
End Sub

Sub InserirNoWriter(sEmfPath As String, sId As String, dWidthMM As Double, dHeightMM As Double)
    Dim oGraphic As Object
    Dim oVC As Object
    Dim oCursor As Object
    Dim oSize As Object

    oVC = ThisComponent.CurrentController.ViewCursor
    oCursor = oVC.Text.createTextCursorByRange(oVC.Start)

    oGraphic = ThisComponent.createInstance("com.sun.star.text.TextGraphicObject")
    oGraphic.Graphic = CarregarGrafico(sEmfPath)
    oGraphic.AnchorType = com.sun.star.text.TextContentAnchorType.AS_CHARACTER
    oGraphic.Name = sId

    oSize = TamanhoDoGrafico(dWidthMM, dHeightMM, oGraphic.Graphic)
    oGraphic.Width = oSize.Width
    oGraphic.Height = oSize.Height

    oCursor.Text.insertTextContent(oCursor, oGraphic, False)

    REM Deixa a imagem recém-inserida selecionada — tanto pra já poder
    REM redimensionar/mover na hora quanto pra "Atualizar Imagem
    REM Selecionada" funcionar logo em seguida sem precisar clicar nela.
    ThisComponent.CurrentController.select(oGraphic)
End Sub

REM Utilitário de depuração: lista os nomes dos TextGraphicObjects do Writer
REM num arquivo, pra validar de fora (via linha de comando) que o Name foi
REM gravado certo. Não faz parte do fluxo normal do usuário.
Sub DebugDumpGraphicNames
    Dim oEnum As Object, oGraf As Object
    Dim sOut As String
    Dim iFile As Integer

    oEnum = ThisComponent.GraphicObjects.createEnumeration()
    Do While oEnum.hasMoreElements()
        oGraf = oEnum.nextElement()
        sOut = sOut & oGraf.Name & Chr(10)
    Loop

    iFile = FreeFile
    Open "/tmp/chemdraw-debug-names.txt" For Output As #iFile
    Print #iFile, sOut
    Close #iFile
End Sub

Sub InserirNoImpressOuDraw(sEmfPath As String, sId As String, dWidthMM As Double, dHeightMM As Double)
    Dim oShape As Object
    Dim oSlide As Object
    Dim oPos As New com.sun.star.awt.Point

    oSlide = ThisComponent.CurrentController.CurrentPage
    oShape = ThisComponent.createInstance("com.sun.star.drawing.GraphicObjectShape")
    oSlide.add(oShape)

    oShape.Graphic = CarregarGrafico(sEmfPath)
    oShape.Name = sId

    oPos.X = 2000
    oPos.Y = 2000

    oShape.Size = TamanhoDoGrafico(dWidthMM, dHeightMM, oShape.Graphic)
    oShape.Position = oPos

    ThisComponent.CurrentController.select(oShape)
End Sub

REM ------------------------------------------------------------------
REM Fase 7: edição bidirecional. As duas macros abaixo trabalham em cima
REM da forma selecionada no documento (a que InserirEstruturaQuimica deixou
REM marcada com Name = id).
REM ------------------------------------------------------------------

REM Pega a forma única selecionada no documento, seja ela a seleção direta
REM (comum no Writer quando só a imagem está selecionada) ou o primeiro item
REM de uma coleção de seleção (comum no Impress/Draw). Devolve Nothing se
REM não houver uma forma selecionada.
Function PegarFormaSelecionada() As Object
    Dim oSel As Object
    Dim bEhForma As Boolean

    On Error GoTo SemSelecao
    oSel = ThisComponent.CurrentSelection
    If IsNull(oSel) Then GoTo SemSelecao

    bEhForma = False
    If HasUnoInterfaces(oSel, "com.sun.star.lang.XServiceInfo") Then
        bEhForma = oSel.supportsService("com.sun.star.text.TextGraphicObject") _
            Or oSel.supportsService("com.sun.star.drawing.GraphicObjectShape")
    End If

    If bEhForma Then
        PegarFormaSelecionada = oSel
        Exit Function
    End If

    If oSel.Count >= 1 Then
        PegarFormaSelecionada = oSel.getByIndex(0)
        Exit Function
    End If

    SemSelecao:
    PegarFormaSelecionada = Nothing
End Function

REM ------------------------------------------------------------------
REM Editar Estrutura Química: com a imagem inserida pelo ChemDraw Linux
REM selecionada, abre o app já carregado com o .ket correspondente.
REM ------------------------------------------------------------------
Sub EditarEstruturaQuimica
    Dim oForma As Object
    Dim sId As String
    Dim sKetPath As String
    Dim sLauncher As String

    oForma = PegarFormaSelecionada()
    If IsNull(oForma) Or IsEmpty(oForma) Then
        MsgBox "Selecione primeiro uma estrutura inserida pelo ChemDraw Linux.", 48, "ChemDraw Linux"
        Exit Sub
    End If

    sId = oForma.Name
    If sId = "" Then
        MsgBox "Essa imagem não tem um id do ChemDraw Linux (Name vazio) — provavelmente não foi inserida pela macro InserirEstruturaQuimica.", 48, "ChemDraw Linux"
        Exit Sub
    End If

    sKetPath = ChemDrawExportDir() & "/" & sId & ".ket"
    If Not FileExists(sKetPath) Then
        MsgBox "Não achei " & sKetPath & "." & Chr(10) & _
               "O arquivo pode ter sido movido ou apagado.", 48, "ChemDraw Linux"
        Exit Sub
    End If

    sLauncher = ChemDrawLauncherPath()
    If Not FileExists(sLauncher) Then
        MsgBox "Não achei o launcher do ChemDraw Linux (" & sLauncher & ")." & Chr(10) & _
               "Abra o ChemDraw Linux pelo menos uma vez pra ele gravar esse arquivo.", 48, "ChemDraw Linux"
        Exit Sub
    End If

    Shell(sLauncher, 1, """" & sKetPath & """", False)
End Sub

REM ------------------------------------------------------------------
REM Atualizar Imagem Selecionada: com a mesma imagem ainda selecionada
REM (depois de editar e reexportar no ChemDraw Linux), troca o conteúdo
REM gráfico pelo .emf atualizado — mantém posição, largura e Name, não
REM insere uma cópia nova. A altura É recalculada (mantendo a largura atual)
REM pra bater com a proporção da estrutura editada, que pode ter mudado
REM desde a última exportação (ex.: editar adicionou/removeu átomos) — sem
REM isso, a moldura antiga distorcia o desenho novo.
REM ------------------------------------------------------------------
Sub AtualizarImagemSelecionada
    Dim oForma As Object
    Dim sId As String
    Dim sEmfPath As String
    Dim oNovoGrafico As Object
    Dim aExp As Variant
    Dim oTamGrafico As Object
    Dim dRazao As Double

    oForma = PegarFormaSelecionada()
    If IsNull(oForma) Or IsEmpty(oForma) Then
        MsgBox "Selecione primeiro a estrutura que você quer atualizar.", 48, "ChemDraw Linux"
        Exit Sub
    End If

    sId = oForma.Name
    If sId = "" Then
        MsgBox "Essa imagem não tem um id do ChemDraw Linux (Name vazio).", 48, "ChemDraw Linux"
        Exit Sub
    End If

    sEmfPath = ChemDrawExportDir() & "/" & sId & ".emf"
    If Not FileExists(sEmfPath) Then
        MsgBox "Não achei " & sEmfPath & "." & Chr(10) & _
               "Exporte de novo no ChemDraw Linux (Ctrl+E) antes de atualizar.", 48, "ChemDraw Linux"
        Exit Sub
    End If

    oNovoGrafico = CarregarGrafico(sEmfPath)
    oForma.Graphic = oNovoGrafico

    dRazao = 0
    aExp = LerExportacaoPorId(sId)
    If aExp(0) <> "" And aExp(3) > 0 And aExp(4) > 0 Then
        REM widthMM/heightMM calculados pelo Node.js a partir do SVG — mais
        REM precisos que reler o tamanho do próprio .emf já convertido.
        dRazao = aExp(4) / aExp(3)
    Else
        On Error Resume Next
        oTamGrafico = oNovoGrafico.Size100thMM
        If Not IsNull(oTamGrafico) And oTamGrafico.Width > 0 Then
            dRazao = oTamGrafico.Height / oTamGrafico.Width
        End If
        On Error GoTo 0
    End If

    If dRazao > 0 Then oForma.Height = Int(oForma.Width * dRazao)
End Sub

REM ------------------------------------------------------------------
REM Biblioteca de Estruturas: diálogo flutuante com miniaturas de todas as
REM estruturas já exportadas (não só a mais recente), pra escolher qual
REM inserir no documento atual — parecido com o seletor de referências do
REM Zotero. Clicar numa miniatura insere aquela estrutura e fecha o
REM diálogo; "Fechar" só fecha sem inserir nada.
REM ------------------------------------------------------------------
Sub AbrirBibliotecaEstruturas
    Dim aTodosIds As Variant
    Dim nTotalEncontrado As Integer
    Dim nMostrar As Integer
    Dim oDialogModel As Object
    Dim oImgModel As Object, oLabelModel As Object, oBotaoModel As Object
    Dim i As Integer, iCol As Integer, iLin As Integer
    Dim nColunas As Integer, nLinhas As Integer
    Dim nTamImg As Integer, nCelW As Integer, nCelH As Integer, nMargem As Integer
    Dim nX As Integer, nY As Integer
    Dim aExp As Variant
    Dim oListenerImg As Object, oListenerFechar As Object
    Dim nAlturaGrade As Integer, nAlturaNota As Integer

    aTodosIds = ListarExportacoes()
    On Error Resume Next
    nTotalEncontrado = UBound(aTodosIds) + 1
    On Error GoTo 0
    If nTotalEncontrado <= 0 Then
        MsgBox "Nenhuma estrutura exportada ainda." & Chr(10) & _
               "No ChemDraw Linux, use Estrutura > Exportar para LibreOffice primeiro.", _
               64, "ChemDraw Linux"
        Exit Sub
    End If

    nColunas = 4
    nMostrar = nTotalEncontrado
    If nMostrar > 16 Then nMostrar = 16
    nLinhas = Int((nMostrar - 1) / nColunas) + 1

    nTamImg = 50
    nCelW = 60
    nCelH = 68
    nMargem = 8
    nAlturaGrade = nLinhas * nCelH
    nAlturaNota = 0
    If nTotalEncontrado > nMostrar Then nAlturaNota = 14

    oDialogModel = createUnoService("com.sun.star.awt.UnoControlDialogModel")
    oDialogModel.PositionX = 100
    oDialogModel.PositionY = 100
    oDialogModel.Width = nMargem * 2 + nColunas * nCelW
    oDialogModel.Height = nMargem * 2 + nAlturaGrade + nAlturaNota + 24
    oDialogModel.Title = "Biblioteca de Estruturas — ChemDraw Linux"

    For i = 0 To nMostrar - 1
        iCol = i Mod nColunas
        iLin = Int(i / nColunas)
        nX = nMargem + iCol * nCelW
        nY = nMargem + iLin * nCelH

        aExp = LerExportacaoPorId(aTodosIds(i))
        REM Exportações antigas (de antes da Biblioteca existir) não têm
        REM sidecar <id>.json — cai pro tamanho padrão de TamanhoDoGrafico.
        If aExp(0) = "" Then aExp = Array(aTodosIds(i), "", ChemDrawExportDir() & "/" & aTodosIds(i) & ".emf", 0, 0)

        oImgModel = oDialogModel.createInstance("com.sun.star.awt.UnoControlImageControlModel")
        oImgModel.PositionX = nX
        oImgModel.PositionY = nY
        oImgModel.Width = nTamImg
        oImgModel.Height = nTamImg
        oImgModel.Border = 1
        oImgModel.ScaleImage = True
        oImgModel.HelpText = aTodosIds(i) ' carrega o id pro listener de clique identificar qual foi clicada
        On Error Resume Next
        oImgModel.Graphic = CarregarGrafico(aExp(2))
        On Error GoTo 0
        oDialogModel.insertByName("Miniatura" & i, oImgModel)

        oLabelModel = oDialogModel.createInstance("com.sun.star.awt.UnoControlFixedTextModel")
        oLabelModel.PositionX = nX
        oLabelModel.PositionY = nY + nTamImg + 2
        oLabelModel.Width = nTamImg
        oLabelModel.Height = 10
        oLabelModel.Align = 1
        oLabelModel.Label = FormatarRotuloId(aTodosIds(i))
        oDialogModel.insertByName("Rotulo" & i, oLabelModel)
    Next i

    If nAlturaNota > 0 Then
        oLabelModel = oDialogModel.createInstance("com.sun.star.awt.UnoControlFixedTextModel")
        oLabelModel.PositionX = nMargem
        oLabelModel.PositionY = nMargem + nAlturaGrade + 2
        oLabelModel.Width = oDialogModel.Width - nMargem * 2
        oLabelModel.Height = 10
        oLabelModel.Label = "Mostrando as " & nMostrar & " mais recentes de " & nTotalEncontrado & " no total."
        oDialogModel.insertByName("NotaTruncamento", oLabelModel)
    End If

    oBotaoModel = oDialogModel.createInstance("com.sun.star.awt.UnoControlButtonModel")
    oBotaoModel.PositionX = oDialogModel.Width - nMargem - 50
    oBotaoModel.PositionY = oDialogModel.Height - nMargem - 16
    oBotaoModel.Width = 50
    oBotaoModel.Height = 16
    oBotaoModel.Label = "Fechar"
    oDialogModel.insertByName("BotaoFechar", oBotaoModel)

    goBibliotecaDialog = createUnoService("com.sun.star.awt.UnoControlDialog")
    goBibliotecaDialog.setModel(oDialogModel)

    oListenerImg = CreateUnoListener("ChemDrawLibImg_", "com.sun.star.awt.XMouseListener")
    For i = 0 To nMostrar - 1
        goBibliotecaDialog.getControl("Miniatura" & i).addMouseListener(oListenerImg)
    Next i

    oListenerFechar = CreateUnoListener("ChemDrawLibFechar_", "com.sun.star.awt.XActionListener")
    goBibliotecaDialog.getControl("BotaoFechar").addActionListener(oListenerFechar)

    goBibliotecaDialog.setVisible(True)
    goBibliotecaDialog.execute()
    goBibliotecaDialog.dispose()
End Sub

REM Clique numa miniatura: acha o id guardado em HelpText, fecha o diálogo
REM e insere aquela estrutura no documento atual.
Sub ChemDrawLibImg_mouseReleased(oEvent As Object)
    Dim sId As String
    Dim aExp As Variant

    sId = oEvent.Source.Model.HelpText
    goBibliotecaDialog.endExecute()

    aExp = LerExportacaoPorId(sId)
    If aExp(0) = "" Then
        REM Sem sidecar (exportação antiga) — ainda dá pra inserir com
        REM tamanho padrão, só não sabemos largura/altura calculadas.
        InserirEstruturaPorId(sId, ChemDrawExportDir() & "/" & sId & ".emf", 0, 0)
    Else
        InserirEstruturaPorId(aExp(0), aExp(2), aExp(3), aExp(4))
    End If
End Sub

Sub ChemDrawLibImg_mousePressed(oEvent As Object)
End Sub

Sub ChemDrawLibImg_mouseEntered(oEvent As Object)
End Sub

Sub ChemDrawLibImg_mouseExited(oEvent As Object)
End Sub

Sub ChemDrawLibImg_disposing(oEvent As Object)
End Sub

REM Botão "Fechar": só fecha o diálogo sem inserir nada.
Sub ChemDrawLibFechar_actionPerformed(oEvent As Object)
    goBibliotecaDialog.endExecute()
End Sub

Sub ChemDrawLibFechar_disposing(oEvent As Object)
End Sub

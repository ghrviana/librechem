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

Function ChemDrawExportDir() As String
    ChemDrawExportDir = Environ("HOME") & "/.local/share/chemdraw-linux/exports"
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

REM Tamanho em 1/100mm. Prioriza o widthMM/heightMM calculado pelo próprio
REM ChemDraw Linux (a partir do SVG original, a 96dpi) — tentar ler de volta
REM o tamanho "real" do gráfico já importado (SizePixel/Size100thMM) dá
REM valores errados, porque o importador de SVG do LibreOffice não assume
REM 96dpi pras unidades sem sufixo do SVG.
Function TamanhoDoGrafico(dWidthMM As Double, dHeightMM As Double) As Object
    Dim oSize As New com.sun.star.awt.Size
    If dWidthMM > 0 And dHeightMM > 0 Then
        oSize.Width = Int(dWidthMM * 100)
        oSize.Height = Int(dHeightMM * 100)
    Else
        oSize.Width = 8000
        oSize.Height = 5000
    End If
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

    oSize = TamanhoDoGrafico(dWidthMM, dHeightMM)
    oGraphic.Width = oSize.Width
    oGraphic.Height = oSize.Height

    oCursor.Text.insertTextContent(oCursor, oGraphic, False)
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

    oShape.Size = TamanhoDoGrafico(dWidthMM, dHeightMM)
    oShape.Position = oPos
End Sub

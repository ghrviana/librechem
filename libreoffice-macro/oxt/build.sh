#!/usr/bin/env bash
# Empacota LibreChem.bas + este diretório (description.xml, META-INF/,
# Addons.xcu) numa extensão .oxt instalável, que registra o menu "LibreChem"
# automaticamente no Writer e no Impress (via Addons.xcu) — sem exigir
# o passo manual de Ferramentas > Personalizar que o install.sh ainda deixa
# necessário.
#
# Saída: ../../dist/LibreChem.oxt (não versionado, ver .gitignore).

set -euo pipefail

OXT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MACRO_DIR="$(dirname "$OXT_DIR")"
PROJECT_DIR="$(dirname "$MACRO_DIR")"
DIST_DIR="$PROJECT_DIR/dist"
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

mkdir -p "$DIST_DIR"

cp -r "$OXT_DIR/." "$STAGE_DIR/"
rm -f "$STAGE_DIR/build.sh"

LIB_DIR="$STAGE_DIR/LibreChem"
mkdir -p "$LIB_DIR"

python3 - "$MACRO_DIR/LibreChem.bas" "$LIB_DIR/LibreChem.xba" <<'PYEOF'
import sys
import xml.sax.saxutils as saxutils

src_path, dest_path = sys.argv[1], sys.argv[2]
with open(src_path, encoding="utf-8") as f:
    basic_src = f.read()

escaped = saxutils.escape(basic_src)
xba = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<!DOCTYPE script:module PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "module.dtd">\n'
    '<script:module xmlns:script="http://openoffice.org/2000/script" '
    'script:name="LibreChem" script:language="StarBasic">' + escaped + '</script:module>'
)
with open(dest_path, "w", encoding="utf-8") as f:
    f.write(xba)
PYEOF

cat > "$LIB_DIR/script.xlb" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE library:library PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "library.dtd">
<library:library xmlns:library="http://openoffice.org/2000/library" library:name="LibreChem" library:readonly="false" library:passwordprotected="false">
 <library:element library:name="LibreChem"/>
</library:library>
EOF

# LibreOffice espera um dialog.xlb ao lado do script.xlb pra qualquer
# biblioteca (mesmo sem diálogos .xdl salvos — os diálogos deste projeto
# são montados em runtime via UnoControlDialogModel, não .xdl). Sem esse
# arquivo, o carregamento da biblioteca inteira falha ("Erro geral de
# entrada/saída" no dialog.xlb) e todo script dela some, mesmo os que não
# usam diálogo algum — confirmado testando de verdade com unopkg/soffice.
cat > "$LIB_DIR/dialog.xlb" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE library:library PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "library.dtd">
<library:library xmlns:library="http://openoffice.org/2000/library" library:name="LibreChem" library:readonly="false" library:passwordprotected="false">
</library:library>
EOF

OXT_PATH="$DIST_DIR/LibreChem.oxt"
rm -f "$OXT_PATH"
(cd "$STAGE_DIR" && zip -rq "$OXT_PATH" .)

echo "Extensão gerada em: $OXT_PATH"
echo "Instalar com: unopkg add \"$OXT_PATH\"  (feche o LibreOffice antes)"
echo "Reinstalar/atualizar: unopkg add --force \"$OXT_PATH\""

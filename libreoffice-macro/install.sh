#!/usr/bin/env bash
# Instala a macro ChemDrawLinux.bas na biblioteca "Standard" das Minhas
# Macros do LibreOffice (perfil do usuário atual). Feche o LibreOffice antes
# de rodar — ele não relê os módulos do disco enquanto está aberto.
#
# Depois de instalar, no LibreOffice: Ferramentas > Macros > Editar Macros,
# em "Minhas Macros > Standard > ChemDrawLinux" tem as sub-rotinas
# disponíveis (ex.: InserirEstruturaQuimica). Associe a um atalho de teclado
# em Ferramentas > Personalizar > Teclado, procurando por "ChemDrawLinux".

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASIC_DIR="$HOME/.config/libreoffice/4/user/basic/Standard"
XLB_FILE="$BASIC_DIR/script.xlb"

if pgrep -f soffice.bin > /dev/null 2>&1; then
  echo "Feche o LibreOffice antes de instalar a macro (ele não relê os módulos com o app aberto)." >&2
  exit 1
fi

mkdir -p "$BASIC_DIR"

python3 - "$SCRIPT_DIR/ChemDrawLinux.bas" "$BASIC_DIR/ChemDrawLinux.xba" <<'PYEOF'
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
    'script:name="ChemDrawLinux" script:language="StarBasic">' + escaped + '</script:module>'
)
with open(dest_path, "w", encoding="utf-8") as f:
    f.write(xba)
PYEOF

if [ ! -f "$XLB_FILE" ]; then
  cat > "$XLB_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE library:library PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "library.dtd">
<library:library xmlns:library="http://openoffice.org/2000/library" library:name="Standard" library:readonly="false" library:passwordprotected="false">
 <library:element library:name="ChemDrawLinux"/>
</library:library>
EOF
elif ! grep -q 'library:name="ChemDrawLinux"' "$XLB_FILE"; then
  sed -i 's#</library:library>#  <library:element library:name="ChemDrawLinux"/>\n</library:library>#' "$XLB_FILE"
fi

echo "Macro instalada em: $BASIC_DIR/ChemDrawLinux.xba"
echo "Abra o LibreOffice e rode Ferramentas > Macros > Executar macro > Standard > ChemDrawLinux > InserirEstruturaQuimica"

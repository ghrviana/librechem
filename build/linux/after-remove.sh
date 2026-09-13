#!/bin/bash
# Baseado no after-remove.tpl padrão do electron-builder (node_modules/app-builder-lib/
# templates/linux/after-remove.tpl) — copiado por inteiro pelo mesmo motivo do
# after-install.sh (declarar um "afterRemove" customizado substitui o padrão inteiro).
# A parte de baixo (LibreChem: remove a integração) é o acréscimo deste projeto.

# Delete the link to the binary
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}'
else
    rm -f '/usr/bin/${executable}'
fi

APPARMOR_PROFILE_DEST='/etc/apparmor.d/${executable}'

if [ -f "$APPARMOR_PROFILE_DEST" ]; then
  if apparmor_status --enabled > /dev/null 2>&1; then
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      apparmor_parser --remove "$APPARMOR_PROFILE_DEST" || true
    fi
  fi
  rm -f "$APPARMOR_PROFILE_DEST"
fi

# --- LibreChem: remove a integração com o LibreOffice, se instalada ---
# Melhor esforço: nunca falha a remoção do pacote por causa disso.
export HOME="${HOME:-/root}"
if command -v unopkg >/dev/null 2>&1; then
    unopkg remove --shared org.librechem.libreoffice.integration >/dev/null 2>&1 || true
fi

exit 0

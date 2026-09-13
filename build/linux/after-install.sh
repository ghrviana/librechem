#!/bin/bash
# Baseado no after-install.tpl padrão do electron-builder (node_modules/app-builder-lib/
# templates/linux/after-install.tpl) — precisa ser copiado por inteiro (não só referenciado)
# porque declarar um "afterInstall" customizado no package.json SUBSTITUI o padrão inteiro,
# não soma a ele. A parte de baixo (RESOURCES_DIR em diante) é o acréscimo deste projeto:
# instala a extensão do LibreOffice (.oxt) automaticamente, pra quem instalar via .deb/.rpm
# não precisar rodar `unopkg` na mão.
#
# ${sanitizedProductName} e ${executable} são placeholders do electron-builder (ver
# FpmTarget.js) — substituídos em texto ANTES desse script virar o postinst real. Qualquer
# outro nome nesse formato dólar-chave-nome-chave nesse arquivo quebraria o build ("Macro X
# is not defined"), por isso o resto do script usa "$var" (sem chaves) pras variáveis bash
# normais, e "${var:-default}" (com operador) quando precisar, que não bate nesse padrão.

if type update-alternatives >/dev/null 2>&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Check if user namespaces are supported by the kernel and working with a quick test:
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    # Use SUID chrome-sandbox only on systems without user namespaces:
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# Install apparmor profile. (Ubuntu 24+)
if apparmor_status --enabled > /dev/null 2>&1; then
  APPARMOR_PROFILE_SOURCE='/opt/${sanitizedProductName}/resources/apparmor-profile'
  APPARMOR_PROFILE_TARGET='/etc/apparmor.d/${executable}'
  if apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" > /dev/null 2>&1; then
    cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET"
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET"
    fi
  else
    echo "Skipping the installation of the AppArmor profile as this version of AppArmor does not seem to support the bundled profile"
  fi
fi

# --- LibreChem: instala a integração com o LibreOffice (.oxt), se possível ---
# Sempre roda por conta do próprio pacote (--shared instala pra todos os usuários da
# máquina, sem depender de qual usuário estiver logado nem de sessão gráfica aberta).
# Nunca falha a instalação do pacote inteiro por causa disso (LibreOffice pode nem
# estar instalado ainda) — só avisa no log do apt/dnf.
OXT_PATH='/opt/${sanitizedProductName}/resources/LibreChem.oxt'
export HOME="${HOME:-/root}"

if [ -f "$OXT_PATH" ] && command -v unopkg >/dev/null 2>&1; then
    if unopkg add --shared --force "$OXT_PATH" >/dev/null 2>&1; then
        echo "LibreChem: integração com o LibreOffice instalada (menu 'LibreChem' no Writer/Impress)."
    else
        echo "LibreChem: não consegui instalar a integração com o LibreOffice automaticamente."
        echo "Rode manualmente depois: unopkg add --shared --force '$OXT_PATH'"
    fi
else
    echo "LibreChem: LibreOffice (unopkg) não encontrado — pulei a instalação da integração."
    echo "Se instalar o LibreOffice depois, rode: unopkg add --shared --force '$OXT_PATH'"
fi

exit 0

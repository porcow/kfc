#!/bin/sh

set -eu

KFC_INSTALL_DIR="${KFC_INSTALL_DIR:-$HOME/.local/share/kfc}"
KFC_BIN_DIR="${KFC_BIN_DIR:-$HOME/.local/bin}"
KFC_CONFIG_PATH="${KFC_CONFIG_PATH:-$HOME/.config/kfc/config.toml}"
KFC_PLIST_PATH="${KFC_PLIST_PATH:-$HOME/Library/LaunchAgents/com.kidsalfred.service.plist}"
KFC_LAUNCH_LABEL="com.kidsalfred.service"
KFC_BIN_PATH="${KFC_BIN_DIR}/kfc"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "uninstall.sh currently supports macOS only." >&2
  exit 1
fi

# Preferred path: invoke `kfc service uninstall` first when the installed launcher exists.
if [ -x "${KFC_BIN_PATH}" ]; then
  "${KFC_BIN_PATH}" service uninstall >/dev/null 2>&1 || true
elif [ -f "${KFC_PLIST_PATH}" ] && command -v launchctl >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/${KFC_LAUNCH_LABEL}" >/dev/null 2>&1 || true
  launchctl bootout "gui/$(id -u)" "${KFC_PLIST_PATH}" >/dev/null 2>&1 || true
  rm -f "${KFC_PLIST_PATH}"
fi

rm -rf "${KFC_INSTALL_DIR}"
rm -f "${KFC_BIN_PATH}"
rm -f "${KFC_CONFIG_PATH}"

cat <<EOF
Uninstalled kfc from:
  app:    ${KFC_INSTALL_DIR}
  binary: ${KFC_BIN_PATH}
  config: ${KFC_CONFIG_PATH}

Removed launchd service state from:
  plist:  ${KFC_PLIST_PATH}
EOF

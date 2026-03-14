#!/bin/sh

set -eu

KFC_INSTALL_DIR="${KFC_INSTALL_DIR:-$HOME/.local/share/kfc}"
KFC_BIN_DIR="${KFC_BIN_DIR:-$HOME/.local/bin}"
KFC_CONFIG_PATH="${KFC_CONFIG_PATH:-$HOME/.config/kfc/config.toml}"
KFC_WORK_DIR="${KFC_WORK_DIR:-$HOME/.kfc}"
KFC_PLIST_PATH="${KFC_PLIST_PATH:-$HOME/Library/LaunchAgents/com.kidsalfred.service.plist}"
KFC_LAUNCH_LABEL="com.kidsalfred.service"
KFC_BIN_PATH="${KFC_BIN_DIR}/kfc"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "uninstall.sh currently supports macOS only." >&2
  exit 1
fi

# Preferred path: invoke `kfc uninstall --yes` when the installed launcher exists.
if [ -x "${KFC_BIN_PATH}" ]; then
  "${KFC_BIN_PATH}" uninstall --yes >/dev/null 2>&1 || true
fi

if [ -f "${KFC_PLIST_PATH}" ] && command -v launchctl >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/${KFC_LAUNCH_LABEL}" >/dev/null 2>&1 || true
  launchctl bootout "gui/$(id -u)" "${KFC_PLIST_PATH}" >/dev/null 2>&1 || true
  rm -f "${KFC_PLIST_PATH}"
fi

if [ -d "${KFC_WORK_DIR}" ] && command -v launchctl >/dev/null 2>&1; then
  find "${KFC_WORK_DIR}" -type f -path '*/launchd/*.plist' -print 2>/dev/null | while IFS= read -r cron_plist; do
    launchctl bootout "gui/$(id -u)" "${cron_plist}" >/dev/null 2>&1 || true
    rm -f "${cron_plist}"
  done
fi

rm -rf "${KFC_INSTALL_DIR}"
rm -rf "${KFC_WORK_DIR}"
rm -f "${KFC_BIN_PATH}"
rm -f "${KFC_CONFIG_PATH}"

cat <<EOF
Uninstalled kfc from:
  app:    ${KFC_INSTALL_DIR}
  binary: ${KFC_BIN_PATH}
  config: ${KFC_CONFIG_PATH}
  work:   ${KFC_WORK_DIR}

Removed launchd service state from:
  plist:  ${KFC_PLIST_PATH}
EOF

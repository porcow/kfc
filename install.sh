#!/bin/sh

set -eu

KFC_GITHUB_REPO="${KFC_GITHUB_REPO:-porcow/kfc}"
KFC_REF="${KFC_REF:-main}"
KFC_INSTALL_DIR="${KFC_INSTALL_DIR:-$HOME/.local/share/kfc}"
KFC_BIN_DIR="${KFC_BIN_DIR:-$HOME/.local/bin}"
KFC_CONFIG_PATH="${KFC_CONFIG_PATH:-$HOME/.config/kfc/config.toml}"
KFC_ARCHIVE_URL="${KFC_ARCHIVE_URL:-https://github.com/${KFC_GITHUB_REPO}/archive/refs/heads/${KFC_REF}.tar.gz}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_node_24() {
  node_major="$(node -p "process.versions.node.split('.')[0]")"
  if [ "${node_major}" -lt 24 ]; then
    echo "Node.js 24 or newer is required. Current version: $(node -v)" >&2
    exit 1
  fi
}

if [ "$(uname -s)" != "Darwin" ]; then
  echo "install.sh currently supports macOS only." >&2
  exit 1
fi

require_command curl
require_command tar
require_command npm
require_command node
require_node_24

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/kfc-install.XXXXXX")"
cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT INT TERM

archive_path="${tmp_dir}/kfc.tar.gz"
curl -fsSL "${KFC_ARCHIVE_URL}" -o "${archive_path}"
tar -xzf "${archive_path}" -C "${tmp_dir}"

extracted_dir="$(find "${tmp_dir}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
if [ -z "${extracted_dir}" ] || [ ! -d "${extracted_dir}" ]; then
  echo "Unable to locate extracted repository contents." >&2
  exit 1
fi

mkdir -p "${KFC_INSTALL_DIR}"
rm -rf "${KFC_INSTALL_DIR}/app.previous"
if [ -d "${KFC_INSTALL_DIR}/app" ]; then
  mv "${KFC_INSTALL_DIR}/app" "${KFC_INSTALL_DIR}/app.previous"
fi
mv "${extracted_dir}" "${KFC_INSTALL_DIR}/app"

(cd "${KFC_INSTALL_DIR}/app" && npm install --omit=dev)

mkdir -p "${KFC_BIN_DIR}"
cat > "${KFC_BIN_DIR}/kfc" <<EOF
#!/bin/sh
set -eu
APP_DIR="${KFC_INSTALL_DIR}/app"
cd "\${APP_DIR}"
exec node --experimental-strip-types "\${APP_DIR}/src/kfc.ts" "\$@"
EOF
chmod +x "${KFC_BIN_DIR}/kfc"

mkdir -p "$(dirname "${KFC_CONFIG_PATH}")"
if [ ! -f "${KFC_CONFIG_PATH}" ]; then
  cp "${KFC_INSTALL_DIR}/app/config/example.bot.toml" "${KFC_CONFIG_PATH}"
fi

DEFAULT_CONFIG_PATH="${HOME}/.config/kfc/config.toml"
if [ "${KFC_CONFIG_PATH}" = "${DEFAULT_CONFIG_PATH}" ]; then
  INSTALL_COMMAND="${KFC_BIN_DIR}/kfc service install"
else
  INSTALL_COMMAND="${KFC_BIN_DIR}/kfc service install --config ${KFC_CONFIG_PATH}"
fi

cat <<EOF
Installed kfc into:
  app:    ${KFC_INSTALL_DIR}/app
  binary: ${KFC_BIN_DIR}/kfc
  config: ${KFC_CONFIG_PATH}

If ${KFC_BIN_DIR} is not on your PATH, add it before using kfc directly.

Next steps:
1. Edit ${KFC_CONFIG_PATH} with your Feishu credentials, allowed users, and tasks.
2. Install and start the launchd-managed service:
   ${INSTALL_COMMAND}
3. Later lifecycle commands are:
   ${KFC_BIN_DIR}/kfc service start
   ${KFC_BIN_DIR}/kfc service restart
   ${KFC_BIN_DIR}/kfc service stop
   ${KFC_BIN_DIR}/kfc service uninstall
EOF

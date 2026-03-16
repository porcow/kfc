#!/bin/sh

set -eu

KFC_GITHUB_REPO="${KFC_GITHUB_REPO:-porcow/kfc}"
KFC_RELEASE_API_URL="${KFC_RELEASE_API_URL:-https://api.github.com/repos/${KFC_GITHUB_REPO}/releases/latest}"
KFC_INSTALL_DIR="${KFC_INSTALL_DIR:-$HOME/.local/share/kfc}"
KFC_BIN_DIR="${KFC_BIN_DIR:-$HOME/.local/bin}"
KFC_CONFIG_PATH="${KFC_CONFIG_PATH:-$HOME/.config/kfc/config.toml}"
BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_bun() {
  if command -v bun >/dev/null 2>&1; then
    return 0
  fi

  echo "bun was not found; bootstrapping Bun into ${BUN_INSTALL}" >&2
  curl -fsSL https://bun.sh/install | bash
  PATH="${BUN_INSTALL}/bin:${PATH}"
  export PATH

  if ! command -v bun >/dev/null 2>&1; then
    echo "Bun bootstrap did not produce a usable 'bun' binary. Install Bun manually and rerun install.sh." >&2
    exit 1
  fi
}

if [ "$(uname -s)" != "Darwin" ]; then
  echo "install.sh currently supports macOS only." >&2
  exit 1
fi

require_command curl
require_command tar
ensure_bun

BUN_BIN="$(command -v bun)"
if [ -z "${BUN_BIN}" ]; then
  echo "Unable to resolve Bun executable after bootstrap." >&2
  exit 1
fi

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/kfc-install.XXXXXX")"
cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT INT TERM

release_json_path="${tmp_dir}/release.json"
curl -fsSL \
  -H "Accept: application/vnd.github+json" \
  -H "User-Agent: kfc-install" \
  "${KFC_RELEASE_API_URL}" \
  -o "${release_json_path}"

release_vars="$(
  RELEASE_JSON_PATH="${release_json_path}" bun run - <<'EOF'
import { readFileSync } from 'node:fs';

const path = process.env.RELEASE_JSON_PATH;
if (!path) {
  throw new Error('Missing RELEASE_JSON_PATH');
}
const payload = JSON.parse(readFileSync(path, 'utf8'));
if (payload.draft || payload.prerelease) {
  throw new Error('Latest release is not a stable release.');
}
const asset = (payload.assets || []).find((entry) =>
  typeof entry?.name === 'string'
  && entry.name.endsWith('.tar.gz')
  && typeof entry?.browser_download_url === 'string'
  && entry.browser_download_url,
);
if (!payload.tag_name || !asset) {
  throw new Error('Latest stable release does not expose a .tar.gz asset.');
}
console.log(`KFC_RELEASE_TAG=${payload.tag_name}`);
console.log(`KFC_RELEASE_ASSET_NAME=${asset.name}`);
console.log(`KFC_RELEASE_ASSET_URL=${asset.browser_download_url}`);
EOF
)"
eval "${release_vars}"

archive_path="${tmp_dir}/${KFC_RELEASE_ASSET_NAME}"
curl -fsSL "${KFC_RELEASE_ASSET_URL}" -o "${archive_path}"

extraction_root="${tmp_dir}/extracted"
mkdir -p "${extraction_root}"
tar -xzf "${archive_path}" -C "${extraction_root}"

if [ -f "${extraction_root}/.kfc-release.json" ]; then
  extracted_dir="${extraction_root}"
else
  extracted_dir="$(find "${extraction_root}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
fi

if [ -z "${extracted_dir}" ] || [ ! -d "${extracted_dir}" ]; then
  echo "Unable to locate extracted release contents." >&2
  exit 1
fi

if [ ! -f "${extracted_dir}/.kfc-release.json" ]; then
  echo "Extracted release asset is missing .kfc-release.json." >&2
  exit 1
fi

mkdir -p "${KFC_INSTALL_DIR}"
rm -rf "${KFC_INSTALL_DIR}/app.previous"
if [ -d "${KFC_INSTALL_DIR}/app" ]; then
  mv "${KFC_INSTALL_DIR}/app" "${KFC_INSTALL_DIR}/app.previous"
fi
mv "${extracted_dir}" "${KFC_INSTALL_DIR}/app"

(cd "${KFC_INSTALL_DIR}/app" && bun install --production)

KFC_INSTALL_METADATA_PATH="${KFC_INSTALL_DIR}/install-metadata.json"
KFC_APP_DIR="${KFC_INSTALL_DIR}/app" \
KFC_INSTALL_METADATA_PATH="${KFC_INSTALL_METADATA_PATH}" \
bun run - <<'EOF'
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const appDir = process.env.KFC_APP_DIR;
const metadataPath = process.env.KFC_INSTALL_METADATA_PATH;
if (!appDir || !metadataPath) {
  throw new Error('Missing install metadata environment');
}
const releaseMetadata = JSON.parse(readFileSync(join(appDir, '.kfc-release.json'), 'utf8'));
const now = new Date().toISOString();
const current = {
  install_source: 'github-release',
  repo: releaseMetadata.repo,
  channel: releaseMetadata.channel,
  current_version: releaseMetadata.version,
  previous_version: null,
  installed_at: now,
  previous_installed_at: null,
};
if (existsSync(metadataPath)) {
  try {
    const previous = JSON.parse(readFileSync(metadataPath, 'utf8'));
    current.previous_version = previous.current_version ?? null;
    current.previous_installed_at = previous.installed_at ?? null;
  } catch {
    // Leave previous-version fields unset on invalid metadata during fresh install.
  }
}
writeFileSync(metadataPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
EOF

mkdir -p "${KFC_BIN_DIR}"
cat > "${KFC_BIN_DIR}/kfc" <<EOF
#!/bin/sh
set -eu
APP_DIR="${KFC_INSTALL_DIR}/app"
export KFC_BUN_BIN="${BUN_BIN}"
cd "\${APP_DIR}"
exec "\${KFC_BUN_BIN}" "\${APP_DIR}/src/kfc.ts" "\$@"
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
  app:      ${KFC_INSTALL_DIR}/app
  binary:   ${KFC_BIN_DIR}/kfc
  config:   ${KFC_CONFIG_PATH}
  version:  ${KFC_RELEASE_TAG}
  metadata: ${KFC_INSTALL_METADATA_PATH}

If ${KFC_BIN_DIR} is not on your PATH, add it before using kfc directly.

Dependency installation and installed runtime execution are managed with Bun.

Next steps:
1. Edit ${KFC_CONFIG_PATH} with your Feishu credentials, allowed users, and tasks.
2. Install and start the launchd-managed service:
   ${INSTALL_COMMAND}
3. Later lifecycle commands are:
   ${KFC_BIN_DIR}/kfc update
   ${KFC_BIN_DIR}/kfc rollback
   ${KFC_BIN_DIR}/kfc service restart
   ${KFC_BIN_DIR}/kfc service uninstall
EOF

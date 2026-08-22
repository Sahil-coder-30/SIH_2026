#!/usr/bin/env bash
# Preflight-checked installer for a React Bits component via the shadcn CLI
# Usage: ./install-component.sh "https://reactbits.dev/r/<Component>-<Variant>" [target-folder]

set -euo pipefail

URL="${1:-}"
TARGET_DIR="${2:-components/reactbits}"

if [[ -z "$URL" ]]; then
  echo "Usage: $0 <reactbits-registry-url> [target-folder]"
  echo "Example: $0 \"https://reactbits.dev/r/Lightfall-JS-TW\" components/reactbits"
  exit 1
fi

if [[ ! -f "components.json" ]]; then
  echo "components.json not found in the current directory."
  echo "Run 'npx shadcn@latest init' first, then re-run this script."
  exit 1
fi

if [[ -f "package.json" ]]; then
  echo "Snapshotting package.json before install..."
  cp package.json /tmp/package.json.before-reactbits-install
else
  echo "WARNING: package.json not found — dependency diff will be skipped."
fi

echo "Installing from: $URL"
npx shadcn@latest add "$URL"

if [[ -f "/tmp/package.json.before-reactbits-install" ]]; then
  echo
  echo "Dependency diff:"
  diff /tmp/package.json.before-reactbits-install package.json || true
  echo
  echo "Cross-check any new dependency against references/install-and-dependencies.md"
  echo "for version-conflict resolution (npm ls <pkg>) before proceeding."
fi

mkdir -p "$TARGET_DIR"
echo
echo "Reminder: if the CLI dropped the file into the default components/ui/"
echo "folder, move it into $TARGET_DIR now and fix its import path — do not"
echo "leave it mixed with hand-written or official shadcn UI components."
echo
echo "Next steps:"
echo "  1. scripts/audit-component.sh <path-to-new-file>"
echo "  2. Fill in assets/PROVENANCE.template.md next to the component"

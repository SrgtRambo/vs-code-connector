#!/bin/zsh
set -e
cd "$(dirname "$0")"
NODE_BIN="$HOME/Library/Application Support/ForgeAI/node-v26.13.0/bin/node"
if [[ ! -x "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node || true)"
fi
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "Node.js is not available. Install Node.js, then reopen this file."
  read "?Press Return to close..."
  exit 1
fi
exec "$NODE_BIN" server.js

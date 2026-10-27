#!/bin/sh
# Portable launcher (Linux + macOS): resolves symlinks without readlink -f.
SELF="$0"
while [ -L "$SELF" ]; do
  D="$(cd "$(dirname "$SELF")" && pwd)"
  SELF="$(readlink "$SELF")"
  case "$SELF" in /*) ;; *) SELF="$D/$SELF" ;; esac
done
DIR="$(cd "$(dirname "$SELF")" && pwd)"
export PLAYWRIGHT_BROWSERS_PATH="$DIR/browsers"
exec "$DIR/node/bin/node" "$DIR/app/index.js" "$@"

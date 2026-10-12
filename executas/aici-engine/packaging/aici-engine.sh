SELF="$(readlink -f "$0")"
DIR="$(dirname "$SELF")"
export PLAYWRIGHT_BROWSERS_PATH="$DIR/browsers"
exec "$DIR/node/bin/node" "$DIR/app/index.js" "$@"
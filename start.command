#!/bin/zsh
# Doppio clic dal Finder per avviare Tri-D Chess su macOS.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js non trovato. Installa con: brew install node  (oppure da https://nodejs.org)"
  read -k1 "?Premi un tasto per chiudere…"; exit 1
fi
[ -d node_modules ] || npm install
PORT=${PORT:-47321}
( sleep 1.5; open "http://localhost:$PORT" ) &
exec node server.js

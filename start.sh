#!/usr/bin/env bash
# Башни и руны — локальный запуск
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Нужен Node.js 18+ (https://nodejs.org)"; exit 1; }
[ -d node_modules ] || npm install --no-audit --no-fund
echo "Шахта поднимается: http://localhost:${PORT:-3000}"
exec node server/index.js

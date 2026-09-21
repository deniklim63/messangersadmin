#!/usr/bin/env bash
# Обновление прода: проверяем код локально, заливаем и пересобираем контейнер.
# Миграции применяются сами при старте приложения.
set -euo pipefail

SERVER="root@157.230.30.28"
REMOTE_DIR="/root/tg-admin"

echo "→ Проверяю типы"
npx tsc --noEmit

echo "→ Проверяю линтером"
npx eslint src

# В файле с "use server" каждый экспорт обязан быть async — иначе сборка падает,
# а tsc и eslint этого не замечают.
echo "→ Проверяю server actions"
for file in $(grep -rl '"use server"' src); do
  if grep -nE '^export (function|const) ' "$file" | grep -v 'async' > /dev/null; then
    echo "В $file есть не-async экспорт — вынесите его в отдельный модуль:"
    grep -nE '^export (function|const) ' "$file" | grep -v 'async'
    exit 1
  fi
done

echo "→ Заливаю код на $SERVER"
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude .env \
  --exclude src/generated \
  -e ssh ./ "$SERVER:$REMOTE_DIR/"

echo "→ Пересобираю и перезапускаю"
ssh "$SERVER" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d --build && docker image prune -f >/dev/null"

echo "→ Проверяю"
sleep 5
curl -s -o /dev/null -w "https://bots-admin.157.230.30.28.sslip.io/login → %{http_code}\n" \
  https://bots-admin.157.230.30.28.sslip.io/login

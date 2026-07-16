#!/bin/bash
set +e

export PORT=${PORT:-8080}
export NEXT_PORT=3000

envsubst '${PORT}' < /etc/nginx/sites-available/default.template > /etc/nginx/sites-available/default
ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

cd /app/polymarket-backend
. venv/bin/activate
POLY_PORT=8090 \
POLYMARKET_PRIVATE_KEY="${POLYMARKET_PRIVATE_KEY:-}" \
POLYMARKET_FUNDER_ADDRESS="${POLYMARKET_FUNDER_ADDRESS:-}" \
python server.py &
POLY_PID=$!

cd /app
PORT=$NEXT_PORT npm start &
NEXT_PID=$!

# Wait for Next.js to be ready before starting nginx (avoids 502)
for i in $(seq 1 15); do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

nginx -g 'daemon off;' &
NGINX_PID=$!

cleanup() {
    kill $NGINX_PID $NEXT_PID $POLY_PID 2>/dev/null
    wait
}
trap cleanup SIGTERM SIGINT

wait

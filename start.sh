#!/bin/bash
set -e

export PORT=${PORT:-8080}
export NEXT_PORT=3000

envsubst '${PORT}' < /etc/nginx/sites-available/default.template > /etc/nginx/sites-available/default
ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Start Tor if POLYMARKET_USE_TOR is set
if [ -n "${POLYMARKET_USE_TOR:-}" ]; then
    echo "Starting Tor..."
    tor -f /app/torrc &
    TOR_PID=$!
    sleep 5
    echo "Tor started (PID $TOR_PID)"
fi

cd /app/polymarket-backend
. venv/bin/activate
POLYMARKET_PRIVATE_KEY="${POLYMARKET_PRIVATE_KEY:-}" \
POLYMARKET_FUNDER_ADDRESS="${POLYMARKET_FUNDER_ADDRESS:-}" \
python server.py &
POLY_PID=$!

cd /app
PORT=$NEXT_PORT npm start &
NEXT_PID=$!

sleep 1
nginx -g 'daemon off;' &
NGINX_PID=$!

cleanup() {
    kill $NGINX_PID $NEXT_PID $POLY_PID 2>/dev/null
    wait
}
trap cleanup SIGTERM SIGINT

wait

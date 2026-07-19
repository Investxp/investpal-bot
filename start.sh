#!/bin/bash
set -e

export PORT=${PORT:-8080}
export NEXT_PORT=3000

envsubst '${PORT}' < /etc/nginx/sites-available/default.template > /etc/nginx/sites-available/default
ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Start Tor daemon
echo "Starting Tor..."
mkdir -p /tmp/tor
tor -f /app/torrc &
TOR_PID=$!

echo "Waiting for Tor bootstrap on 127.0.0.1:9050..."
for i in $(seq 1 60); do
    if python3 -c "import socket; s=socket.socket(); s.settimeout(2); s.connect(('127.0.0.1',9050)); s.close()" 2>/dev/null; then
        echo "Tor ready after ${i}s"
        break
    fi
    if ! kill -0 $TOR_PID 2>/dev/null; then
        echo "Tor process died during bootstrap"
        break
    fi
    sleep 1
done
echo "Tor PID $TOR_PID (port 9050)"

cd /app/polymarket-backend
. venv/bin/activate
POLYMARKET_PRIVATE_KEY="${POLYMARKET_PRIVATE_KEY:-}" \
POLYMARKET_FUNDER_ADDRESS="${POLYMARKET_FUNDER_ADDRESS:-}" \
PORT=8090 python server.py &
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

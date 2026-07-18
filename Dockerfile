FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY scripts ./scripts/
RUN npm ci --legacy-peer-deps --ignore-scripts
RUN node scripts/copy-smartcharts-assets.js
COPY app ./app
COPY components ./components
COPY hooks ./hooks
COPY lib ./lib
COPY packages ./packages
COPY public ./public
COPY scripts ./scripts
COPY declarations.d.ts next-env.d.ts next.config.js package.json postcss.config.js tailwind.config.js tsconfig.json vercel.json ./
RUN npm run build -- --webpack

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv nginx gettext tor && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

COPY polymarket-backend /app/polymarket-backend

RUN python3 -m venv /app/polymarket-backend/venv && \
    /app/polymarket-backend/venv/bin/pip install -r /app/polymarket-backend/requirements.txt

COPY nginx.conf /etc/nginx/sites-available/default.template
COPY torrc /app/torrc
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8080

CMD ["/app/start.sh"]

# trigger rebuild 20260717204436
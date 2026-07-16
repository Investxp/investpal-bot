# Deploy InvestPal Bot

## Option 1: Docker / Fly.io (Recommended — Unified)

Deploys Next.js + Python backend in one container behind nginx.

### Local Docker test
```bash
docker build -t investpal-bot .
docker run -p 8080:8080 -e POLYMARKET_PRIVATE_KEY=0x... investpal-bot
```
Open http://localhost:8080 — both tabs work.

### Deploy to Fly.io
```bash
# Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly launch --no-deploy
fly secrets set POLYMARKET_PRIVATE_KEY=0x... POLYMARKET_FUNDER_ADDRESS=0x...
fly deploy
```
Edit `fly.toml` to change the app name and region first.

### Environment variables
| Variable | Required | Description |
|---|---|---|
| `POLYMARKET_PRIVATE_KEY` | For Polymarket | Wallet private key or seed phrase |
| `POLYMARKET_FUNDER_ADDRESS` | Optional | Address for position funding |
| `PORT` | Optional | Container port (default 8080) |

---

## Option 2: Vercel (Frontend Only)

Bot Builder tab only — Polymarket tab needs a separate Python backend host.

### Steps
1. Create a GitHub repo at **https://github.com/new** (name: `investpal-bot`, public)
2. Upload files (drag & drop) — exclude `node_modules/`, `.next/`, `polymarket-backend/`, `cloudflared.exe`
3. Go to **https://vercel.com/new**, import the repo, click Deploy
4. You'll get a URL like `investpal-bot.vercel.app`

### Polymarket tab
To also serve Polymarket on Vercel, deploy the Python backend separately:
- [Render](https://render.com) — Web Service, start command `cd polymarket-backend && python server.py`
- [Railway](https://railway.app) — same config
- Then update the iframe src in `components/custom/polymarket-view.tsx` to point to that URL

---

## Files included
| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build: Next.js + Python + nginx |
| `nginx.conf` | Reverse proxy: `/polymarket/*` → Python, `/*` → Next.js |
| `start.sh` | Entrypoint — starts all three processes |
| `fly.toml` | Fly.io configuration |
| `.dockerignore` | Excludes build artifacts |
| `polymarket-backend/` | Python Polymarket trade engine (copied from betika_backend) |

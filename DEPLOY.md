# Deploy InvestPal Bot to Vercel (Free)

## Prerequisites
- A [GitHub](https://github.com) account
- A [Vercel](https://vercel.com) account (sign up with GitHub)

## Steps

### 1. Create a GitHub repo
- Go to **https://github.com/new**
- Repo name: `investpal-bot` (or any name)
- Keep it **Public** (free Vercel tier)
- **Do not** initialize with README/.gitignore/license
- Click **Create repository**

### 2. Upload the code
On the empty repo page, click **"uploading an existing file"**, then drag & drop:

```
accumulators-app/
├── .gitignore
├── vercel.json
├── next.config.js
├── package.json
├── tsconfig.json
├── postcss.config.js
├── tailwind.config.ts
├── app/
├── components/
├── hooks/
├── lib/
├── scripts/
├── public/
├── styles/
├── types/
```

**DO NOT** include: `node_modules/`, `.next/`, `public/chart/`

After uploading, click **Commit changes**.

### 3. Connect to Vercel
- Go to **https://vercel.com/new**
- Import your GitHub repo (e.g. `Investxp/investpal-bot`)
- Vercel auto-detects Next.js — defaults are fine
- Click **Deploy**

### 4. Done
You'll get a URL like `investpal-bot.vercel.app`.

## Notes
- The **Bot Builder** tab works fully on Vercel
- The **Polymarket** tab (Python backend) needs a separate host (Railway, Render) — not included here
- CSP in `next.config.js` already allows `*.vercel.app` domains
- To use a custom domain, update the CSP and add it in Vercel dashboard

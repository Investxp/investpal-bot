import os, json, logging

log = logging.getLogger("telegram")

def send_signal(config, market_name, side, price, stake, edge, odds, end_date, slug, strategy):
    token = config.get('telegram_bot_token', '') or os.getenv('TELEGRAM_BOT_TOKEN', '')
    chat_id = config.get('telegram_chat_id', '') or os.getenv('TELEGRAM_CHAT_ID', '')
    enabled = config.get('telegram_signals', False)
    if not enabled or not token or not chat_id:
        return {"ok": False, "error": "Telegram not configured"}
    if not market_name:
        return {"ok": False, "error": "No market name"}
    price_str = f"${price:.3f}" if isinstance(price, (int, float)) else str(price)
    stake_str = f"${stake:.2f}" if isinstance(stake, (int, float)) else str(stake)
    edge_str = f"{edge*100:.1f}%" if isinstance(edge, (int, float)) and edge < 1 else f"{edge:.1f}%"
    odds_str = f"{odds:.2f}" if isinstance(odds, (int, float)) else str(odds)
    link = f"https://polymarket.com/market/{slug}" if slug else ""
    strategy_label = {'hedge': 'Hedge', 'single': 'Single (Kelly)', 'market_making': 'Market Making'}.get(strategy, strategy)
    msg = (
        f"\U0001f4ca INVESTPAL SIGNAL\n"
        f"Strategy: {strategy_label}\n"
        f"Market: {market_name[:80]}\n"
        f"Side: {side} | Price: {price_str} | Stake: {stake_str}\n"
        f"Edge: {edge_str} | Odds: {odds_str}"
    )
    if end_date:
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(str(end_date).replace('Z', '+00:00'))
            msg += f"\nExp: {dt.strftime('%b %d %H:%M')}"
        except:
            msg += f"\nExp: {end_date}"
    if link:
        msg += f"\n{link}"
    try:
        import requests
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": msg, "parse_mode": "HTML"},
            timeout=10,
            proxies=os.environ.get('POLYMARKET_PROXY') and {
                'http': os.environ['POLYMARKET_PROXY'],
                'https': os.environ['POLYMARKET_PROXY'],
            } or None,
        )
        if r.ok:
            log.info(f"Telegram signal sent for {market_name[:40]}")
            return {"ok": True}
        else:
            log.error(f"Telegram API error: {r.status_code} {r.text[:200]}")
            return {"ok": False, "error": f"API {r.status_code}: {r.text[:100]}"}
    except Exception as e:
        log.error(f"Telegram send failed: {e}")
        return {"ok": False, "error": str(e)}

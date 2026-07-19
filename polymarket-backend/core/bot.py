import json, os, logging, time, random
from datetime import datetime, timezone, timedelta
from core.polymarket import place_order, check_market_resolution, place_order_poly1271, get_deposit_wallet_balance, ensure_deposit_balance
from core.martingale import get_state as get_main_state, _w as save_main_state
from core.trade_engine import _r as load_results, _w as save_results
from core import position_manager, balance_manager

log = logging.getLogger("bot")
DATA      = os.path.join(os.path.dirname(__file__), '..', 'data')
BOT_STATE = os.path.join(DATA, 'bot_state.json')
BOT_CFG   = os.path.join(DATA, 'bot_config.json')

D_CFG   = {'bot_enabled': False, 'bot_mode': 'simulation', 'base_stake': 0.1, 'recovery_factor': 2.0,
           'max_concurrent': 1, 'bankroll': 100.0, 'balance_filter': 0.30, 'interval_seconds': 60,
           'order_type': 'poly1271', 'auto_fund': True, 'min_pusd': 1.0, 'sport_filter': ''}
D_STATE = {'bankroll': 100.0, 'pnl': 0.0, 'active_bets': [],
           'cycles': 0, 'wins': 0, 'losses': 0, 'log': [],
           'streak_a': 0, 'streak_b': 0}

def _r(f, d):
    try:
        with open(f) as fp: return json.load(fp)
    except: return d.copy()

def _w(f, d):
    os.makedirs(DATA, exist_ok=True)
    with open(f, 'w') as fp: json.dump(d, fp, indent=2)

def get_config():    return _r(BOT_CFG,   D_CFG)
def save_config(c):  _w(BOT_CFG, {**D_CFG, **c})
def get_bot_state(): return _r(BOT_STATE, D_STATE)

def get_pk():
    env_file = os.path.join(os.path.dirname(__file__), '..', '.env')
    env = {}
    if os.path.isfile(env_file):
        try:
            for line in open(env_file):
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, _, v = line.partition('=')
                    env[k.strip()] = v.strip().strip('"').strip("'")
        except: pass
    return env.get("POLYMARKET_PRIVATE_KEY", "") or os.getenv("POLYMARKET_PRIVATE_KEY", "")

def get_funder():
    env_file = os.path.join(os.path.dirname(__file__), '..', '.env')
    env = {}
    if os.path.isfile(env_file):
        try:
            for line in open(env_file):
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, _, v = line.partition('=')
                    env[k.strip()] = v.strip().strip('"').strip("'")
        except: pass
    return env.get("POLYMARKET_FUNDER_ADDRESS", "") or os.getenv("POLYMARKET_FUNDER_ADDRESS", "")

def _log(state, msg, level='info'):
    ts = datetime.now().strftime('%H:%M:%S')
    state.setdefault('log', []).insert(0, {'time': ts, 'msg': msg, 'type': level})
    if len(state['log']) > 100:
        state['log'] = state['log'][:100]

def get_rec(oA, oB):
    if not oA or not oB: return "SKIP"
    try:
        iA = 1.0 / oA
        iB = 1.0 / oB
        margin = (iA + iB - 1.0) * 100.0
        diff = abs(oA - oB)
        if margin < 6.0 and diff < 0.06: return "VALUE"
        if margin < 8.0 and diff < 0.12: return "VALUE"
        if margin < 10.0 and diff < 0.20: return "FAIR"
        if diff <= 0.30: return "WATCH"
    except: pass
    return "SKIP"

def _place_poly1271_hedge(m, stake_a, stake_b, pk, dw, state, cfg):
    token_ids = m.get('token_ids', [])
    if len(token_ids) < 2:
        _log(state, 'POLY_1271: Market missing token IDs', 'error')
        return None
    price_a = m.get('yes_price', 0.5)
    price_b = m.get('no_price', 0.5)
    _log(state, f"POLY_1271 HEDGE: A @{price_a} (${stake_a}) & B @{price_b} (${stake_b})", 'info')
    res_a = place_order_poly1271(token_id=token_ids[0], side='BUY', price=price_a, size_usdc=stake_a, private_key=pk, deposit_wallet=dw)
    res_b = place_order_poly1271(token_id=token_ids[1], side='BUY', price=price_b, size_usdc=stake_b, private_key=pk, deposit_wallet=dw)
    if res_a.get('ok') and res_b.get('ok'):
        q = (m.get('question') or m.get('name', ''))[:60]
        for side_label, res, st, pr in [('A', res_a, stake_a, price_a), ('B', res_b, stake_b, price_b)]:
            oid = res.get('order_id', '')
            position_manager.record_order(token_ids[0 if side_label == 'A' else 1], 'BUY', pr, st, oid, m)
            state['active_bets'].append({
                'market_id': m.get('market_id'), 'name': q, 'sport': m.get('sport', ''),
                'side': side_label, 'odds': m.get(f'o{side_label}'), 'price': pr, 'stake': st,
                'placed': datetime.now().strftime('%H:%M'), 'ts': time.time(),
                'simulation': False, 'order_id': oid, 'end_date': m.get('end_date'),
                'token_id': token_ids[0 if side_label == 'A' else 1],
                'order_type': 'poly1271',
                'slug': m.get('slug', ''),
            })
        _log(state, f"POLY_1271 Hedge placed on {q[:30]}!", 'info')
        return {"orders": [res_a, res_b], "prices": [price_a, price_b], "stakes": [stake_a, stake_b]}
    err = f"A: {res_a.get('error') or 'OK'} | B: {res_b.get('error') or 'OK'}"
    _log(state, f"POLY_1271 Hedge failed: {err}", 'error')
    return None

def run_cycle(markets):
    cfg   = get_config()
    state = get_bot_state()
    if not cfg.get('bot_enabled'):
        _log(state, 'Bot disabled — skipping cycle.', 'warn')
        _w(BOT_STATE, state); return state
    state['cycles'] = state.get('cycles', 0) + 1
    mode = cfg.get('bot_mode', 'simulation')
    order_type = cfg.get('order_type', 'standard')
    use_poly1271 = (order_type == 'poly1271' and mode == 'live')
    if len(markets) == 0:
        _log(state, "Market cache empty. Warmup in progress.", "warn")
    state.setdefault('streak_a', 0)
    state.setdefault('streak_b', 0)
    _log(state, f"Cycle #{state['cycles']} ({mode.upper()}/{order_type}) — Streaks: A={state['streak_a']} B={state['streak_b']} | {len(markets)} markets", 'info')
    active_bets = state.get('active_bets', [])
    still_active = []
    grouped_bets = {}
    for bet in active_bets:
        m_id = bet.get('market_id')
        grouped_bets.setdefault(m_id, []).append(bet)
    utc_now = datetime.now(timezone.utc)
    for m_id, bets in grouped_bets.items():
        is_sim = any(b.get('simulation', True) for b in bets)
        resolved = False
        outcome_is_A = True
        winner_str = ""
        first_bet = bets[0]
        end_date_str = first_bet.get('end_date')
        if is_sim:
            if end_date_str:
                try:
                    dt = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
                    if utc_now >= dt:
                        resolved = True
                        outcome_is_A = random.random() > 0.50
                        winner_str = "YES" if outcome_is_A else "NO"
                except:
                    resolved = True
                    outcome_is_A = random.random() > 0.50
                    winner_str = "YES" if outcome_is_A else "NO"
            else:
                if time.time() - first_bet.get('ts', time.time()) > 600:
                    resolved = True
                    outcome_is_A = random.random() > 0.50
                    winner_str = "YES" if outcome_is_A else "NO"
        else:
            res = check_market_resolution(m_id)
            if res.get('resolved'):
                resolved = True
                consensus_outcome = res.get('outcome')
                outcome_is_A = (consensus_outcome == 0)
                winner_str = res.get('winner', 'YES' if outcome_is_A else 'NO')
        if resolved:
            total_net_pnl = 0.0
            results_log = []
            for bet in bets:
                side = bet.get('side', 'A')
                stake = bet.get('stake', 10.0)
                odds = bet.get('odds', 2.0)
                price = bet.get('price', 0.5)
                won = (side == 'A' and outcome_is_A) or (side == 'B' and not outcome_is_A)
                if is_sim:
                    bet_pnl = round((odds - 1.0) * stake if won else -stake, 2)
                else:
                    bet_pnl = round(stake * (1.0 / price - 1.0) if won else -stake, 2)
                total_net_pnl += bet_pnl
                results_log.append(f"{side}:{won and 'WON ✓' or 'LOST ✗'} ({bet_pnl:+.2f} USDC)")
                oid = bet.get('order_id', '')
                position_manager.resolve_position(oid, won, bet_pnl)
            max_steps = int(cfg.get('max_steps', 6) or 6)
            main_s = get_main_state()
            main_s['bankroll'] = round(main_s.get('bankroll', 200.0) + total_net_pnl, 2)
            main_s['total_pnl'] = round(main_s.get('total_pnl', 0.0) + total_net_pnl, 2)
            if outcome_is_A:
                main_s['streak_a'] = 0
                main_s['streak_b'] = min(main_s.get('streak_b', 0) + 1, max_steps)
                main_s['wins'] += 1
            else:
                main_s['streak_a'] = min(main_s.get('streak_a', 0) + 1, max_steps)
                main_s['streak_b'] = 0
                main_s['losses'] += 1
            main_s['updated'] = datetime.now(timezone.utc).isoformat()
            save_main_state(main_s)
            state['streak_a'] = main_s['streak_a']
            state['streak_b'] = main_s['streak_b']
            state['bankroll'] = main_s['bankroll']
            state['pnl']      = main_s['total_pnl']
            state['wins']     = main_s['wins']
            state['losses']   = main_s['losses']
            results_file = os.path.join(DATA, 'results.json')
            resolved_entry = {
                'id': m_id,
                'name': first_bet.get('name', 'Hedge')[:60],
                'sport': first_bet.get('sport', 'Sports'),
                'side': 'A' if outcome_is_A else 'B',
                'stake': sum(b.get('stake', 0) for b in bets),
                'odds': first_bet.get('odds', 2.0),
                'status': 'resolved',
                'result': 'WIN' if total_net_pnl >= 0 else 'LOSS',
                'pnl': total_net_pnl,
                'simulation': is_sim,
                'end_date': first_bet.get('end_date', ''),
                'resolved_at': datetime.now(timezone.utc).isoformat()
            }
            existing = load_results(results_file, [])
            existing.append(resolved_entry)
            save_results(results_file, existing)
            log_prefix = "[SIM]" if is_sim else "[LIVE]"
            m_name = first_bet.get('name', 'Hedge')[:45]
            _log(state, f"{log_prefix} Resolved: {m_name} | {', '.join(results_log)} | Net PnL: {total_net_pnl:+.2f} USDC (Winner: {winner_str})", 'info' if total_net_pnl >= 0 else 'error')
        else:
            still_active.extend(bets)
    state['active_bets'] = still_active
    active_market_ids = {b.get('market_id') for b in state['active_bets'] if b.get('market_id')}
    active_events_count = len(active_market_ids)
    max_concurrent = int(cfg.get('max_concurrent', 3) or 3)
    slots_available = max_concurrent - active_events_count
    if slots_available > 0 and mode == 'live' and use_poly1271:
        pk = get_pk()
        dw = get_funder()
        if pk and dw and cfg.get('auto_fund', True):
            bal = get_deposit_wallet_balance(dw)
            balance_manager.record_check(bal)
            min_pusd = int(cfg.get('min_pusd', 1.0) * 1e6)
            if balance_manager.need_topup(bal):
                _log(state, f"Deposit wallet low: {bal/1e6:.4f} pUSD. Auto-funding...", 'warn')
                fund_res = ensure_deposit_balance(pk, dw, min_balance=min_pusd)
                balance_manager.record_topup(
                    max(0, int(2e6 - bal) / 1e6),
                    fund_res.get('ok', False),
                    fund_res.get('tx_log', []),
                    fund_res.get('error')
                )
                if fund_res.get('ok'):
                    _log(state, f"Funded! Balance: {fund_res.get('balance_after', 0)/1e6:.4f} pUSD", 'info')
                else:
                    _log(state, f"Auto-fund failed: {fund_res.get('error', 'unknown')}", 'error')
    if slots_available > 0:
        cutoff = utc_now + timedelta(hours=72)
        cands = []
        sport_filter = (cfg.get('sport_filter', '') or '').lower()
        for m in markets:
            market_id = m.get('market_id')
            if not market_id or market_id in active_market_ids:
                continue
            ed = m.get('end_date', '')
            if not ed: continue
            try:
                dt = datetime.fromisoformat(ed.replace('Z', '+00:00'))
                if utc_now < dt <= cutoff:
                    oA, oB = m.get('oA', 0), m.get('oB', 0)
                    rec = get_rec(oA, oB)
                    if rec != "SKIP":
                        if sport_filter and (m.get('sport', '') or '').lower() != sport_filter:
                            continue
                        cands.append(m)
            except: continue
        cands.sort(key=lambda x: x.get('end_date', '9999'))
        for m in cands[:slots_available]:
            market_id = m.get('market_id')
            main_s = get_main_state()
            factor = float(cfg.get('factor', main_s.get('factor', 2.1)))
            base_stake = float(cfg.get('base_stake', main_s.get('base_stake', 10.0)))
            max_steps = int(cfg.get('max_steps', main_s.get('max_steps', 6)))
            stake_a = round(base_stake * (factor ** min(main_s.get('streak_a', 0), max_steps)), 2)
            stake_b = round(base_stake * (factor ** min(main_s.get('streak_b', 0), max_steps)), 2)
            total_stake = round(stake_a + stake_b, 2)
            if mode == 'simulation':
                if main_s.get('bankroll', 200.0) < total_stake:
                    _log(state, f"Insufficient demo bankroll: {total_stake} USDC needed", 'error')
                    break
            if mode == 'live':
                pk = get_pk()
                if not pk:
                    _log(state, 'Live: No private key configured.', 'error')
                    break
                token_ids = m.get('token_ids', [])
                if len(token_ids) < 2:
                    _log(state, 'Live: Market missing token IDs', 'error')
                elif use_poly1271:
                    dw = get_funder()
                    if not dw:
                        _log(state, 'POLY_1271: No deposit wallet configured.', 'error')
                    else:
                        result = _place_poly1271_hedge(m, stake_a, stake_b, pk, dw, state, cfg)
                        if result:
                            main_s = get_main_state()
                            main_s['bankroll'] = round(main_s.get('bankroll', 200.0) - total_stake, 2)
                            save_main_state(main_s)
                            state['bankroll'] = main_s['bankroll']
                else:
                    price_a = m.get('yes_price', 0.5)
                    price_b = m.get('no_price', 0.5)
                    funder = get_funder()
                    _log(state, f"Placing LIVE HEDGE: A @{price_a} (${stake_a}) & B @{price_b} (${stake_b})", 'info')
                    res_a = place_order(token_id=token_ids[0], side='BUY', price=price_a, size_usdc=stake_a, private_key=pk, funder=funder)
                    res_b = place_order(token_id=token_ids[1], side='BUY', price=price_b, size_usdc=stake_b, private_key=pk, funder=funder)
                    if res_a.get('ok') and res_b.get('ok'):
                        q = (m.get('question') or m.get('name', ''))[:60]
                        for side_label, res, st, pr in [('A', res_a, stake_a, price_a), ('B', res_b, stake_b, price_b)]:
                            oid = res.get('order_id', '')
                            position_manager.record_order(token_ids[0 if side_label == 'A' else 1], 'BUY', pr, st, oid, m)
                            state['active_bets'].append({
                                'market_id': market_id, 'name': q, 'sport': m.get('sport', ''),
                                'side': side_label, 'odds': m.get(f'o{side_label}'), 'price': pr, 'stake': st,
                                'placed': datetime.now().strftime('%H:%M'), 'ts': time.time(),
                                'simulation': False, 'order_id': oid, 'end_date': m.get('end_date'),
                                'order_type': 'standard',
                                'slug': m.get('slug', ''),
                            })
                        _log(state, f"LIVE Hedge placed on {q[:30]}!", 'info')
                    else:
                        err = f"A: {res_a.get('error') or 'OK'} | B: {res_b.get('error') or 'OK'}"
                        _log(state, f"LIVE Hedge failed: {err}", 'error')
            else:
                main_s = get_main_state()
                main_s['bankroll'] = round(main_s.get('bankroll', 200.0) - total_stake, 2)
                save_main_state(main_s)
                state['bankroll'] = main_s['bankroll']
                q = (m.get('question') or m.get('name', ''))[:60]
                state['active_bets'].append({
                    'market_id': market_id, 'name': q, 'sport': m.get('sport', ''),
                    'side': 'A', 'odds': m.get('oA'), 'stake': stake_a,
                    'placed': datetime.now().strftime('%H:%M'), 'ts': time.time(),
                    'simulation': True, 'end_date': m.get('end_date'),
                    'slug': m.get('slug', ''),
                })
                state['active_bets'].append({
                    'market_id': market_id, 'name': q, 'sport': m.get('sport', ''),
                    'side': 'B', 'odds': m.get('oB'), 'stake': stake_b,
                    'placed': datetime.now().strftime('%H:%M'), 'ts': time.time(),
                    'simulation': True, 'end_date': m.get('end_date'),
                    'slug': m.get('slug', ''),
                })
                _log(state, f"[SIM] HEDGE on {q[:35]} | A: ${stake_a} @{m.get('oA')} | B: ${stake_b} @{m.get('oB')}", 'info')
        if not cands and active_events_count == 0:
            _log(state, "No upcoming non-skip Polymarket sports events in window.", "debug")
    _log(state, f"Cycle done. Bankroll: ${state['bankroll']:,.2f} | Active: {len(state['active_bets'])}", 'info')
    _w(BOT_STATE, state); return state

def reset_bot():
    cfg = get_config()
    s   = D_STATE.copy()
    s['bankroll'] = cfg.get('bankroll', 200.0)
    _w(BOT_STATE, s); return s

def run_bot_loop(stop_event, get_markets_fn):
    while not stop_event.is_set():
        try:
            cfg = get_config()
            if cfg.get('bot_enabled'):
                run_cycle(get_markets_fn())
        except Exception as e:
            log.error(f"Bot loop: {e}")
        interval = int(get_config().get('interval_seconds', 60))
        stop_event.wait(interval)

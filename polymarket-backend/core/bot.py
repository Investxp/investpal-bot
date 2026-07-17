import json, os, logging, time, random
from datetime import datetime, timezone, timedelta
from core.polymarket import place_order, check_market_resolution
from core.martingale import get_state as get_main_state, _w as save_main_state
from core.trade_engine import _r as load_results, _w as save_results


log = logging.getLogger("bot")
DATA      = os.path.join(os.path.dirname(__file__), '..', 'data')
BOT_STATE = os.path.join(DATA, 'bot_state.json')
BOT_CFG   = os.path.join(DATA, 'bot_config.json')

D_CFG   = {'bot_enabled': False, 'bot_mode': 'simulation', 'base_stake': 0.1, 'recovery_factor': 2.0,
           'max_concurrent': 1, 'bankroll': 100.0, 'balance_filter': 0.30, 'interval_seconds': 60}
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
        except:
            pass
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
        except:
            pass
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
    except:
        pass
    return "SKIP"

def run_cycle(markets):
    cfg   = get_config()
    state = get_bot_state()
    if not cfg.get('bot_enabled'):
        _log(state, 'Bot disabled — skipping cycle.', 'warn')
        _w(BOT_STATE, state); return state

    state['cycles'] = state.get('cycles', 0) + 1
    mode = cfg.get('bot_mode', 'simulation')
    
    if len(markets) == 0:
        _log(state, "Polymarket market cache is empty. Warmup in progress or blocked. Resolution checks will still run.", "warn")
    
    # Initialize streaks if not present
    state.setdefault('streak_a', 0)
    state.setdefault('streak_b', 0)
    
    _log(state, f"Cycle #{state['cycles']} ({mode.upper()}) — Streaks: A={state['streak_a']} B={state['streak_b']} | {len(markets)} markets available", 'info')

    # Resolve bets
    active_bets = state.get('active_bets', [])
    still_active = []
    
    # Group bets by market_id
    grouped_bets = {}
    for bet in active_bets:
        m_id = bet.get('market_id')
        grouped_bets.setdefault(m_id, []).append(bet)
        
    utc_now = datetime.now(timezone.utc)
    
    for m_id, bets in grouped_bets.items():
        is_sim = any(b.get('simulation', True) for b in bets)
        
        # Check if the market has resolved or closed
        resolved = False
        outcome_is_A = True # True if YES wins, False if NO wins
        winner_str = ""
        
        first_bet = bets[0]
        end_date_str = first_bet.get('end_date')
        
        if is_sim:
            # Simulation resolution based on end_date passage
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
                # Fallback if no end date
                if time.time() - first_bet.get('ts', time.time()) > 600:
                    resolved = True
                    outcome_is_A = random.random() > 0.50
                    winner_str = "YES" if outcome_is_A else "NO"
        else:
            # Live resolution check
            res = check_market_resolution(m_id)
            if res.get('resolved'):
                resolved = True
                consensus_outcome = res.get('outcome')
                # 0 is YES, 1 is NO
                outcome_is_A = (consensus_outcome == 0)
                winner_str = res.get('winner', 'YES' if outcome_is_A else 'NO')
                
        if resolved:
            # Resolve the hedge
            total_net_pnl = 0.0
            results_log = []
            
            for bet in bets:
                side = bet.get('side', 'A')
                stake = bet.get('stake', 10.0)
                odds = bet.get('odds', 2.0)
                price = bet.get('price', 0.5)
                
                # Check if this specific bet won
                won = (side == 'A' and outcome_is_A) or (side == 'B' and not outcome_is_A)
                
                if is_sim:
                    bet_pnl = round((odds - 1.0) * stake if won else -stake, 2)
                else:
                    # In live mode, payout is 1.0 USDC per contract if won
                    bet_pnl = round(stake * (1.0 / price - 1.0) if won else -stake, 2)
                    
                total_net_pnl += bet_pnl
                results_log.append(f"{side}:{won and 'WON ✓' or 'LOST ✗'} ({bet_pnl:+.2f} USDC)")
                
            # Update streaks based on outcome in shared main state.json
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
            
            # Keep bot state in sync with main state
            state['streak_a'] = main_s['streak_a']
            state['streak_b'] = main_s['streak_b']
            state['bankroll'] = main_s['bankroll']
            state['pnl']      = main_s['total_pnl']
            state['wins']     = main_s['wins']
            state['losses']   = main_s['losses']
            
            # Save resolved trade to results.json for the Results tab
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

    # Place new bets if we have available concurrent slots
    active_market_ids = {b.get('market_id') for b in state['active_bets'] if b.get('market_id')}
    active_events_count = len(active_market_ids)
    max_concurrent = int(cfg.get('max_concurrent', 3) or 3)
    slots_available = max_concurrent - active_events_count
    
    if slots_available > 0:
        cutoff = utc_now + timedelta(hours=72)
        
        # Filter markets to only include those ending in next 4 hours (excluding SKIP and already active)
        cands = []
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
                        cands.append(m)
            except: continue

        # Sort by end_date ascending so we recover by the NEXT IMMEDIATE sport event
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
            
            if mode == 'live':
                # In live mode, verify real balance if needed, or simply proceed
                pass
            else:
                # In simulation mode, check main bankroll
                if main_s.get('bankroll', 200.0) < total_stake:
                    _log(state, f"Insufficient demo bankroll to place hedge. Required: {total_stake} USDC", 'error')
                    break
            
            token_ids = m.get('token_ids', [])
            
            if mode == 'live':
                pk = get_pk()
                if not pk:
                    _log(state, 'Live order failed: Polygon Private Key not configured in Settings.', 'error')
                    break
                elif len(token_ids) < 2:
                    _log(state, 'Live order failed: Market does not have token IDs for YES/NO.', 'error')
                else:
                    price_a = m.get('yes_price', 0.5)
                    price_b = m.get('no_price', 0.5)
                    funder = get_funder()
                    
                    _log(state, f"Placing LIVE HEDGE: A @{price_a} (${stake_a}) & B @{price_b} (${stake_b})...", 'info')
                    
                    res_a = place_order(token_id=token_ids[0], side='BUY', price=price_a, size_usdc=stake_a, private_key=pk, funder=funder)
                    res_b = place_order(token_id=token_ids[1], side='BUY', price=price_b, size_usdc=stake_b, private_key=pk, funder=funder)
                    
                    if res_a.get('ok') and res_b.get('ok'):
                        # For live mode, track virtual state or real state (here we can also deduct from main virtual bankroll if the user wants virtual tracker in live, but typically they track real USDC)
                        q = (m.get('question') or m.get('name', ''))[:60]
                        
                        state['active_bets'].append({
                            'market_id': market_id, 'name': q, 'sport': m.get('sport', ''),
                            'side': 'A', 'odds': m.get('oA'), 'price': price_a, 'stake': stake_a,
                            'placed': datetime.now().strftime('%H:%M'), 'ts': time.time(),
                            'simulation': False, 'order_id': res_a.get('order_id'), 'end_date': m.get('end_date')
                        })
                        state['active_bets'].append({
                            'market_id': market_id, 'name': q, 'sport': m.get('sport', ''),
                            'side': 'B', 'odds': m.get('oB'), 'price': price_b, 'stake': stake_b,
                            'placed': datetime.now().strftime('%H:%M'), 'ts': time.time(),
                            'simulation': False, 'order_id': res_b.get('order_id'), 'end_date': m.get('end_date')
                        })
                        _log(state, f"LIVE Hedge Order placed successfully on {q[:30]}!", 'info')
                    else:
                        err = f"A: {res_a.get('error') or 'OK'} | B: {res_b.get('error') or 'OK'}"
                        _log(state, f"LIVE Hedge Placement failed: {err}", 'error')
            else:
                # Simulation mode: Deduct from shared main bankroll!
                main_s = get_main_state()
                main_s['bankroll'] = round(main_s.get('bankroll', 200.0) - total_stake, 2)
                save_main_state(main_s)
                
                # Keep bot state bankroll in sync
                state['bankroll'] = main_s['bankroll']
                
                q = (m.get('question') or m.get('name', ''))[:60]
                
                state['active_bets'].append({
                    'market_id': market_id, 'name': q, 'sport': m.get('sport', ''),
                    'side': 'A', 'odds': m.get('oA'), 'stake': stake_a,
                    'placed': datetime.now().strftime('%H:%M'), 'ts': time.time(),
                    'simulation': True, 'end_date': m.get('end_date')
                })
                state['active_bets'].append({
                    'market_id': market_id, 'name': q, 'sport': m.get('sport', ''),
                    'side': 'B', 'odds': m.get('oB'), 'stake': stake_b,
                    'placed': datetime.now().strftime('%H:%M'), 'ts': time.time(),
                    'simulation': True, 'end_date': m.get('end_date')
                })
                _log(state, f"[SIM] HEDGE Placed on {q[:35]} | A: ${stake_a} @{m.get('oA')} | B: ${stake_b} @{m.get('oB')}", 'info')
                
        if not cands and active_events_count == 0:
            _log(state, "No upcoming non-skip Polymarket sports events in the 4-hour window.", "debug")
            
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

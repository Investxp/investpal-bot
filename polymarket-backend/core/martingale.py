import json, os, logging
from datetime import datetime, timezone
log = logging.getLogger("martingale")
DATA  = os.path.join(os.path.dirname(__file__), '..', 'data')
STATE = os.path.join(DATA, 'state.json')

def _r():
    try:
        with open(STATE) as f: return json.load(f)
    except: return _d()

def _w(s):
    os.makedirs(DATA, exist_ok=True)
    with open(STATE, 'w') as f: json.dump(s, f, indent=2)

def _d():
    return {'bankroll': 200.0, 'base_stake': 10.0, 'factor': 2.1, 'max_steps': 6,
            'streak_a': 0, 'streak_b': 0, 'total_pnl': 0.0, 'wins': 0, 'losses': 0,
            'updated': datetime.now(timezone.utc).isoformat()}

def get_state(): return _r()

def calc_stake(streak, state=None):
    s = state or _r()
    return round(s['base_stake'] * (s['factor'] ** min(streak, s['max_steps'])), 2)

def record_outcome(side, won, odds, stake):
    s = _r()
    pnl = round((odds - 1) * stake if won else -stake, 2)
    s['bankroll']  = round(s['bankroll']  + pnl, 2)
    s['total_pnl'] = round(s['total_pnl'] + pnl, 2)
    if won:
        if side == 'A': s['streak_a'] = 0
        else:           s['streak_b'] = 0
        s['wins'] += 1
    else:
        if side == 'A': s['streak_a'] = min(s['streak_a'] + 1, s['max_steps'])
        else:           s['streak_b'] = min(s['streak_b'] + 1, s['max_steps'])
        s['losses'] += 1
    s['updated'] = datetime.now(timezone.utc).isoformat()
    _w(s); return s

def update_config(bankroll=None, base_stake=None, factor=None, max_steps=None):
    s = _r()
    if bankroll   is not None: s['bankroll']   = float(bankroll)
    if base_stake is not None: s['base_stake'] = float(base_stake)
    if factor     is not None: s['factor']     = float(factor)
    if max_steps  is not None: s['max_steps']  = int(max_steps)
    _w(s); return s

def reset_state(bankroll=200, base_stake=10, factor=2.1, max_steps=6):
    s = _d()
    s['bankroll']   = float(bankroll)
    s['base_stake'] = float(base_stake)
    s['factor']     = float(factor)
    s['max_steps']  = int(max_steps)
    _w(s); return s

def recovery_table(steps=7):
    s = _r(); rows = []; cum = 0
    for i in range(steps):
        sa = calc_stake(s['streak_a'] + i, s)
        sb = calc_stake(s['streak_b'] + i, s)
        comb = round(sa + sb, 2); cum = round(cum + comb, 2)
        rows.append({'step': i, 'stake_a': sa, 'stake_b': sb,
                     'combined': comb, 'cumulative': cum})
    return rows

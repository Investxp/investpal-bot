import json, os, logging
from datetime import datetime, timezone
from core.martingale import record_outcome, calc_stake

log = logging.getLogger("engine")
DATA    = os.path.join(os.path.dirname(__file__), '..', 'data')
PICKS   = os.path.join(DATA, 'picks.json')
RESULTS = os.path.join(DATA, 'results.json')
TRACKED = os.path.join(DATA, 'tracked.json')

def _r(f, d):
    try:
        with open(f) as fp: return json.load(fp)
    except: return d

def _w(f, d):
    os.makedirs(DATA, exist_ok=True)
    with open(f, 'w') as fp: json.dump(d, fp, indent=2)

def get_picks():   return _r(PICKS, [])
def get_results(): return list(reversed(_r(RESULTS, [])))
def get_tracked(): return _r(TRACKED, {})
def save_tracked(d): _w(TRACKED, d)

def resolve_pick(pick_id, won, side=None):
    picks = _r(PICKS, []); resolved = None
    for p in picks:
        if p['id'] == pick_id and p['status'] == 'pending':
            use_side = side or p['side']
            pnl = round((p['odds'] - 1) * p['stake'] if won else -p['stake'], 2)
            p.update({'status': 'resolved', 'result': 'WIN' if won else 'LOSS',
                      'pnl': pnl, 'side': use_side,
                      'resolved_at': datetime.now(timezone.utc).isoformat()})
            record_outcome(use_side, won, p['odds'], p['stake'])
            resolved = p; break
    _w(PICKS, picks)
    if resolved:
        results = _r(RESULTS, [])
        results.append(resolved)
        _w(RESULTS, results)
    return resolved

def reset_all():
    _w(PICKS, []); _w(RESULTS, []); _w(TRACKED, {})

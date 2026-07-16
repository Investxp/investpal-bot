import requests
import json
import sys
sys.path.append('.')
from core.polymarket import parse_market

gamma_url = "https://gamma-api.polymarket.com/markets"
params = {
    "active": "false",
    "closed": "true",
    "tag_slug": "sports",
    "limit": 5,
    "order": "endDate",
    "ascending": "false"
}
r = requests.get(gamma_url, params=params)
markets = r.json()
print("Fetched", len(markets), "closed markets")
for m in markets:
    print("---")
    print("Question:", m.get("question"))
    p = parse_market(m, force_sports=False, allow_closed=True)
    print("Parsed as sports:", p is not None)
    if p:
        print("Parsed detail:", p.get("name"), "sport:", p.get("sport"))

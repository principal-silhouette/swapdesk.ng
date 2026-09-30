"""Build data/catalog-snapshot.json from two Sheet reads (JSON from values.get):
   1) 'Site Feed'!A1:X  -> used only for the per-model Deductions it joins in
   2) 'Devices'!B5:Z    -> the source for every row: Swap Into (J), Show on Site (K), Notes (P),
                           Selling Price (S), Trade-In Value (X). Site Feed lags the Devices rounding rules
                           and drops rows whose Status isn't Live, so it isn't used for figures.
Stock tags at the start of Notes (pricing agent, 30 Sep):
   [Sold out]  we sell it, no stock today: listed as Sold out, no price shown, can't be picked.
               Any figure in Selling Price is a Jiji estimate for the trade-in maths only.
   [Not sold]  never sold (swap only): not on the Shop list or swap targets; trade-in works
   [Swap only if bought from us]  trade-in notice for that model
Usage: python3 tools/build-snapshot.py site_feed.json devices.json
"""
import json, sys, datetime
from collections import Counter

feed = json.load(open(sys.argv[1]))['values']
dev = json.load(open(sys.argv[2]))['values']
DKEYS = ['battery','body','network','screen','trueTone','backGlass','faceId','touchId','earpiece','loudspeaker','camera','chargingPort']

def num(v):
    if v is None or v == '': return None
    s = str(v).strip().lower()
    if s in ('n/a', 'na'): return 'n/a'
    try: return float(s.replace('₦', '').replace(',', ''))
    except ValueError: return None

def deductions(r):
    out = {}
    for k, v in zip(DKEYS, r[11:23]):
        n = num(v)
        if n == 'n/a': out[k] = 'n/a'
        elif isinstance(n, float): out[k] = int(n)
    return out

ded_by_id, ded_by_model, deal_note = {}, {}, {}
for r in feed[1:]:
    r = list(r) + [''] * (24 - len(r))
    if not r[0]: continue
    ded_by_id[r[0]] = deductions(r)
    if ded_by_id[r[0]]: ded_by_model.setdefault(r[4], ded_by_id[r[0]])
    if r[23]: deal_note[r[0]] = r[23]

# Devices B..Z -> 0..24
B, C, D_, E, F, G, H, I, J, K = range(10)
P, S, X = 14, 17, 22
devs = []
for r in dev:
    r = list(r) + [''] * (25 - len(r))
    if not r[B] or r[K] != 'Yes': continue
    note = r[P] or ''
    stock = 'soldout' if '[Sold out]' in note else 'notsold' if '[Not sold]' in note else ''
    price, tiv = num(r[S]), num(r[X])
    d = {'id': r[B], 'type': r[C], 'brand': r[D_], 'series': r[E], 'model': r[F], 'storage': r[G] or '',
         'condition': r[H], 'tradeIn': r[I] == 'Yes', 'swapInto': r[J] == 'Yes' and stock != 'notsold',
         'price': int(price) if isinstance(price, float) and price > 0 and not stock else None,
         'tradeInValue': int(tiv) if isinstance(tiv, float) and tiv > 0 else None}
    if stock: d['stock'] = stock
    if '[Swap only if bought from us]' in note: d['onlyIfBought'] = True
    # A row we sell but with no price and no sold-out tag can't be shown with a price: treat as sold out.
    if d['swapInto'] and not d['price'] and not stock: d['stock'] = 'soldout'
    d['deductions'] = ded_by_id.get(d['id']) or ded_by_model.get(d['model'], {})
    if d['id'] in deal_note: d['dealNote'] = deal_note[d['id']]
    devs.append(d)

# Deals live only in Site Feed.
for r in feed[1:]:
    r = list(r) + [''] * (24 - len(r))
    if r[0] and r[6] == 'Deal':
        p = num(r[9])
        devs.append({'id': r[0], 'type': r[1], 'brand': r[2], 'series': r[3], 'model': r[4], 'storage': r[5] or '',
                     'condition': 'Deal', 'tradeIn': False, 'swapInto': str(r[8]).upper() == 'TRUE',
                     'price': int(p) if isinstance(p, float) and p > 0 else None, 'tradeInValue': None,
                     'deductions': {}, 'dealNote': r[23] or ''})

old = json.load(open('data/catalog-snapshot.json'))
out = {'updatedAt': datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z', 'source': 'snapshot',
       'settings': old['settings'], 'devices': devs}
json.dump(out, open('data/catalog-snapshot.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(devs), 'devices;', Counter(d.get('stock', 'in stock') for d in devs))
print('sold, priced:', sum(1 for d in devs if d['swapInto'] and d['price']))

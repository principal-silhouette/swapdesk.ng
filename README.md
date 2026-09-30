# swapdesk.ng

SwapDesk website · An Upgrade Brands product.

A static site (GitHub Pages, no build step). Prices come from the
"2026 - @the.swapdesk BE" Google Sheet through a small Apps Script web app.

| Link | Page |
|---|---|
| `/` | Swap: value a device, compare up to 6 swaps, save/share, WhatsApp handoff |
| `/?view=prices` | Price List (with Deals when available) |
| `/?view=trade-in` | Trade-In Values |
| `/?q=SD-XXXXXX` · `/?s=…` | A saved quote |

## Layout

- `js/engine.js`: valuation logic (pure, tested)
- `js/data.js`: catalogue loading (live endpoint → cached copy → `data/catalog-snapshot.json`)
- `js/quote.js`: quote links, share text, WhatsApp message
- `js/ui/`: screens (swap flow, lists, quote view), picker, sheet, springs
- `apps-script/`: the sheet backend and how to deploy it
- `js/config.js`: endpoint URL, WhatsApp number, cities

## Work on it

```sh
python3 -m http.server 8000   # then open http://localhost:8000
node --test tests/*.test.mjs  # engine and quote tests
```

Pushing to `v2.3.0.0.1` deploys to production. Work on `v4-redesign` until a preview is approved.

# SwapDesk site backend (Apps Script)

The website reads prices and saves quotes through a small web app bound to the
"2026 - @the.swapdesk BE" sheet. Nothing secret lives in the website.

## Deploy (once, about 5 minutes)

1. Open the sheet → **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` with `apps-script/Code.gs` from this repo. Save.
3. Choose `testCatalog` in the function menu and press **Run**. Approve the permissions
   prompt (it only touches this spreadsheet). The log should read "215 devices; settings: …".
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the web app URL (ends in `/exec`) and paste it into `js/config.js` as `endpoint`.

To update later: edit the code, then **Deploy → Manage deployments → Edit → New version**.
The URL stays the same.

## What it does

| Call | Returns |
|---|---|
| `GET ?action=catalog` | Site Feed devices + customer-safe Rules, cached 5 minutes (`&fresh=1` skips the cache) |
| `GET ?action=quote&id=SD-XXXXXX` | The saved quote from whichever monthly quotes tab holds it (column U) |
| `POST {"action":"saveQuote","quote":{…}}` | Adds a row to this month's quotes tab, returns `{ ok, id, link }`. With `quote.replaceId` it updates that quote in place |

Saved quotes are checked before they're written: known device IDs only, at most 6
compared devices, field lengths capped, a honeypot field, and a simple per-minute limit.

Margins, supply prices, bands and keep rates are never sent to the website.

## Quotes tabs

Quotes are saved to one tab per month, named like **Quotes Oct 2026**. The first save
of a new month makes that month's tab by copying the latest quotes tab's headings and
layout, empty. The original **Quotes** tab is renamed to the month of the first save
after this update. Links keep working for every month, and an edited quote is updated
in the tab where it was first saved.


The script writes columns B–P and U, sets Status to **New**, and never touches
Status, Handled By or Follow-up Notes after that. Column U holds the quote exactly as
the customer saw it so the link reopens the same figures; leave it alone.

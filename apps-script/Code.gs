/**
 * SwapDesk site backend: a Google Apps Script web app bound to
 * "2026 - @the.swapdesk BE". See apps-script/README.md to deploy.
 *
 *   GET  ?action=catalog          → devices, deductions and rules (cached 5 minutes)
 *   GET  ?action=quote&id=SD-XXX  → a saved quote, exactly as the customer saw it
 *   POST {action:"saveQuote", quote:{…}} (Content-Type text/plain) → { ok, id, link }
 *
 * Only customer-safe data leaves the sheet. Margins, supply prices, bands and
 * keep rates are never returned.
 */

var SITE = 'https://swapdesk.ng/';
var CACHE_KEY = 'catalog.v1';
var CACHE_SECONDS = 300;
var MAX_COMPARE = 6;
var QUOTE_FIRST_ROW = 5;

var SAFE_SETTINGS = [
  'batteryThreshold', 'neatness.spotless', 'neatness.prettyNeat', 'neatness.fewSpots',
  'neatness.smallDents', 'neatness.rough', 'network.chipShare', 'network.esimShare', 'network.lockedShare',
  'trueTone.shareOfScreen', 'rounding.tradeIn', 'rounding.quote', 'compare.maxDevices', 'icloud.locked'
];
var DEDUCTION_KEYS = ['battery', 'body', 'network', 'screen', 'trueTone', 'backGlass', 'faceId',
  'touchId', 'earpiece', 'loudspeaker', 'camera', 'chargingPort'];

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'catalog') return json_(getCatalog_(p.fresh === '1'));
    if (p.action === 'quote') return json_(getQuote_(String(p.id || '')));
    return json_({ ok: true, service: 'swapdesk', actions: ['catalog', 'quote', 'saveQuote'] });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'saveQuote') return json_(saveQuote_(body.quote || {}));
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------- catalog ----------

function getCatalog_(skipCache) {
  var cache = CacheService.getScriptCache();
  if (!skipCache) {
    var hit = cache.get(CACHE_KEY);
    if (hit) return JSON.parse(hit);
  }
  var ss = SpreadsheetApp.getActive();
  // Deductions come from Site Feed (joined per model). Every other figure comes from Devices:
  // Site Feed drops rows whose Status isn't Live and lags the Devices rounding rules.
  var feed = ss.getSheetByName('Site Feed').getDataRange().getValues();
  var dedById = {}, dedByModel = {}, dealNote = {};
  for (var i = 1; i < feed.length; i++) {
    var f = feed[i];
    if (!f[0]) continue;
    var ded = {}, any = false;
    for (var k = 0; k < DEDUCTION_KEYS.length; k++) {
      var v = f[11 + k];
      if (String(v).trim().toLowerCase() === 'n/a') ded[DEDUCTION_KEYS[k]] = 'n/a';
      else if (num_(v)) { ded[DEDUCTION_KEYS[k]] = num_(v); any = true; }
    }
    dedById[String(f[0])] = ded;
    if (any && !dedByModel[f[4]]) dedByModel[f[4]] = ded;
    if (f[23]) dealNote[String(f[0])] = String(f[23]);
  }
  // Devices B..Z from row 5. Stock tags at the start of Notes (P):
  //   [Sold out]  listed as Sold out, no price shown (any Selling Price there is a Jiji estimate), not selectable
  //   [Not sold]  swap only: never on the Shop list or swap targets
  //   [Swap only if bought from us]  trade-in notice
  var dv = ss.getSheetByName('Devices');
  var rows = dv.getRange(5, 2, Math.max(dv.getLastRow() - 4, 1), 25).getValues();
  var devices = [];
  rows.forEach(function (r) {
    if (!r[0] || r[9] !== 'Yes') return;
    var note = String(r[14] || '');
    var stock = note.indexOf('[Sold out]') !== -1 ? 'soldout' : note.indexOf('[Not sold]') !== -1 ? 'notsold' : '';
    var id = String(r[0]);
    var d = {
      id: id, type: r[1], brand: r[2], series: r[3], model: r[4], storage: String(r[5] || ''), condition: r[6],
      tradeIn: r[7] === 'Yes', swapInto: r[8] === 'Yes' && stock !== 'notsold',
      price: stock ? null : num_(r[17]), tradeInValue: num_(r[22]),
      deductions: dedById[id] || dedByModel[r[4]] || {}
    };
    if (d.swapInto && !d.price && !stock) stock = 'soldout';
    if (stock) d.stock = stock;
    if (note.indexOf('[Swap only if bought from us]') !== -1) d.onlyIfBought = true;
    if (dealNote[id]) d.dealNote = dealNote[id];
    devices.push(d);
  });
  // Deals live only in Site Feed (its second FILTER).
  for (var j = 1; j < feed.length; j++) {
    var g = feed[j];
    if (!g[0] || g[6] !== 'Deal') continue;
    devices.push({ id: String(g[0]), type: g[1], brand: g[2], series: g[3], model: g[4], storage: String(g[5] || ''),
      condition: 'Deal', tradeIn: false, swapInto: g[8] === true, price: num_(g[9]), tradeInValue: null,
      deductions: {}, dealNote: String(g[23] || '') });
  }
  var rules = ss.getSheetByName('Rules').getRange('B5:D23').getValues();
  var settings = {};
  rules.forEach(function (row) {
    if (row[0] && SAFE_SETTINGS.indexOf(String(row[0])) !== -1) settings[row[0]] = row[2];
  });
  var out = {
    updatedAt: new Date().toISOString(),
    source: 'live',
    version: 3,
    settings: settings,
    devices: devices
  };
  try { cache.put(CACHE_KEY, JSON.stringify(out), CACHE_SECONDS); } catch (e) { /* over 100 KB: skip cache */ }
  return out;
}

function num_(v) {
  if (typeof v === 'number') return v > 0 ? Math.round(v) : null;
  var n = Number(String(v || '').replace(/[₦,\s]/g, ''));
  return n > 0 ? Math.round(n) : null;
}

// ---------- quotes ----------

function saveQuote_(q) {
  // Spam guards: honeypot, sizes, known devices, simple rate limit.
  if (q.website) return { ok: false, error: 'Rejected' };
  var raw = JSON.stringify(q);
  if (raw.length > 8000) return { ok: false, error: 'Quote too large' };
  var cache = CacheService.getScriptCache();
  var count = Number(cache.get('rate') || 0);
  if (count > 60) return { ok: false, error: 'Busy, try again in a minute' };
  cache.put('rate', String(count + 1), 60);

  var catalog = getCatalog_(false);
  var byId = {};
  catalog.devices.forEach(function (d) { byId[d.id] = d; });
  var dev = q.device || {};
  var compare = (q.compare || []).slice(0, MAX_COMPARE);
  if (dev.id && !byId[dev.id]) return { ok: false, error: 'Unknown device' };
  compare = compare.filter(function (c) { return c && byId[c.id]; });
  if (!dev.id && !compare.length) return { ok: false, error: 'Empty quote' };

  var clean = {
    v: 1,
    created: new Date().toISOString(),
    device: dev.id ? { id: dev.id, name: cut_(dev.name, 120), start: int_(dev.start) } : null,
    answers: q.answers ? {
      icloudLocked: q.answers.icloudLocked === true,
      battery: q.answers.battery === null || q.answers.battery === '' ? null : int_(q.answers.battery),
      neatness: cut_(q.answers.neatness, 20),
      network: cut_(q.answers.network, 20),
      faults: (q.answers.faults || []).slice(0, 12).map(function (f) { return cut_(f, 20); })
    } : null,
    value: int_(q.value),
    lines: (q.lines || []).slice(0, 15).map(function (l) { return [cut_(l[0], 60), l[1] === null ? null : int_(l[1])]; }),
    compare: compare.map(function (c) {
      return { id: c.id, name: cut_(c.name, 120), price: int_(c.price), kind: cut_(c.kind, 12), amount: int_(c.amount), dealNote: cut_(c.dealNote, 120) };
    }),
    items: (q.items || []).slice(0, 3).filter(function (it) { return it && byId[it.id]; }).map(function (it) {
      var ia = it.answers || {};
      return {
        id: it.id, name: cut_(it.name, 120), start: int_(it.start), value: int_(it.value),
        answers: { icloudLocked: ia.icloudLocked === true, battery: ia.battery === null || ia.battery === '' || ia.battery === undefined ? null : int_(ia.battery),
          neatness: cut_(ia.neatness, 20), network: cut_(ia.network, 20), faults: (ia.faults || []).slice(0, 12).map(function (f) { return cut_(f, 20); }),
          batteryLabel: cut_(ia.batteryLabel, 20) },
        lines: (it.lines || []).slice(0, 15).map(function (l) { return [cut_(l[0], 60), l[1] === null ? null : int_(l[1])]; })
      };
    }),
    city: cut_(q.city, 40),
    name: cut_(q.name, 60),
    phone: cut_(q.phone, 20).replace(/[^\d+ ]/g, '')
  };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName('Quotes');
    var last = Math.max(sh.getLastRow(), QUOTE_FIRST_ROW - 1);
    var ids = last >= QUOTE_FIRST_ROW ? sh.getRange(QUOTE_FIRST_ROW, 2, last - QUOTE_FIRST_ROW + 1, 1).getValues().map(function (r) { return r[0]; }) : [];
    var id;
    do { id = newId_(); } while (ids.indexOf(id) !== -1);
    clean.id = id;
    var link = SITE + '?q=' + id;
    var a = clean.answers || {};
    var row = [
      id, new Date(), clean.name, clean.phone, clean.city,
      dev.id || '', clean.items.length > 1 ? clean.items.map(function (it) { return it.name + ' (' + it.value + ')'; }).join('\n') : (clean.device ? clean.device.name : ''),
      a.battery === null || a.battery === undefined ? '' : a.battery,
      a.neatness || '', a.network || '', (a.faults || []).join(', '),
      a.icloudLocked ? 'Yes' : 'No',
      clean.value || '',
      clean.compare.length,
      clean.compare.map(function (c) { return c.name + ': ' + describe_(c); }).join('\n'),
      link, 'New', '', '', JSON.stringify(clean)
    ];
    // First empty row under the header (column B), so the team can sort freely.
    var gap = -1;
    for (var i = 0; i < ids.length; i++) { if (!ids[i]) { gap = i; break; } }
    var target = gap === -1 ? last + 1 : QUOTE_FIRST_ROW + gap;
    sh.getRange(target, 2, 1, row.length).setValues([row]);
    return { ok: true, id: id, link: link, created: clean.created };
  } finally {
    lock.releaseLock();
  }
}

function getQuote_(id) {
  if (!/^SD-[A-Z0-9]{6}$/.test(id)) return { ok: false, error: 'Not a quote ID' };
  var sh = SpreadsheetApp.getActive().getSheetByName('Quotes');
  var last = sh.getLastRow();
  if (last < QUOTE_FIRST_ROW) return { ok: false, error: 'Not found' };
  var found = sh.getRange(QUOTE_FIRST_ROW, 2, last - QUOTE_FIRST_ROW + 1, 1)
    .createTextFinder(id).matchEntireCell(true).findNext();
  if (!found) return { ok: false, error: 'Not found' };
  var data = sh.getRange(found.getRow(), 21).getValue();
  return { ok: true, quote: JSON.parse(data) };
}

function describe_(c) {
  var n = '₦' + Utilities.formatString('%,d', c.amount || 0);
  if (c.kind === 'add') return n + ' to swap';
  if (c.kind === 'receive') return 'we pay ' + n;
  if (c.kind === 'even') return 'even swap';
  return 'full price ₦' + Utilities.formatString('%,d', c.price || 0);
}

function newId_() {
  var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = 'SD-';
  for (var i = 0; i < 6; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return s;
}

function cut_(v, n) { return String(v === undefined || v === null ? '' : v).slice(0, n); }
function int_(v) { var n = Math.round(Number(v)); return isFinite(n) ? n : 0; }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor after deploying to warm the cache and check the output. */
function testCatalog() {
  var c = getCatalog_(true);
  Logger.log(c.devices.length + ' devices; settings: ' + JSON.stringify(c.settings));
}

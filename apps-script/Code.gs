/**
 * SwapDesk site backend: a Google Apps Script web app bound to
 * "2026 - @the.swapdesk BE". See apps-script/README.md to deploy.
 *
 *   GET  ?action=catalog          → devices, deductions and rules (cached 5 minutes)
 *   GET  ?action=quote&id=SD-XXX  → a saved quote, exactly as the customer saw it
 *   POST {action:"saveQuote", quote:{…}} (Content-Type text/plain) → { ok, id, link }
 *        quote.replaceId = SD-XXX updates that quote in place (an edited quote keeps its link)
 *   POST {action:"customer", customer:{name, phone, city}} → { ok, hasPin }   (Customers tab)
 *   POST {action:"signIn", phone, pin} → { ok, name, city, hasPin } or { ok:false, needPin | notFound }
 *   POST {action:"myCodes", phone, pin}  → { ok, codes:[{id, created, label}] } or { ok:false, needPin }
 *   POST {action:"setPin", phone, pin, oldPin} → { ok }
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
  'neatness.smallDents', 'neatness.rough', 'network.chipShare', 'network.esimShare', 'network.lockedShare', 'model.esimOnlyShare', 'model.dualSimShare',
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
    if (body.action === 'customer') return json_(customer_(body.customer || {}));
    if (body.action === 'signIn') return json_(signIn_(String(body.phone || ''), String(body.pin || '')));
    if (body.action === 'myCodes') return json_(myCodes_(String(body.phone || ''), String(body.pin || '')));
    if (body.action === 'setPin') return json_(setPin_(String(body.phone || ''), String(body.pin || ''), String(body.oldPin || '')));
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
  var rules = ss.getSheetByName('Rules').getRange('B5:D60').getValues();
  var settings = {};
  rules.forEach(function (row) {
    if (row[0] && SAFE_SETTINGS.indexOf(String(row[0])) !== -1) settings[row[0]] = row[2];
  });
  var out = {
    updatedAt: new Date().toISOString(),
    source: 'live',
    version: 4,
    // clientIds: the site makes the quote ID itself, so the short link is ready the moment it's needed.
    // customers: sign in with name and WhatsApp number; codes saved under the number (7 Oct).
    features: ['clientIds', 'customers'],
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
      sim: cut_(q.answers.sim, 12),
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
          neatness: cut_(ia.neatness, 20), network: cut_(ia.network, 20), sim: cut_(ia.sim, 12), faults: (ia.faults || []).slice(0, 12).map(function (f) { return cut_(f, 20); }),
          batteryLabel: cut_(ia.batteryLabel, 20) },
        lines: (it.lines || []).slice(0, 15).map(function (l) { return [cut_(l[0], 60), l[1] === null ? null : int_(l[1])]; })
      };
    }),
    city: cut_(q.city, 40),
    name: cut_(q.name, 60),
    phone: normPhone_(q.phone)
  };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // Quotes go to one tab per month ("Quotes Oct 2026"), so no tab grows without end.
    var sh = monthTab_(new Date());
    var last = Math.max(sh.getLastRow(), QUOTE_FIRST_ROW - 1);
    var ids = last >= QUOTE_FIRST_ROW ? sh.getRange(QUOTE_FIRST_ROW, 2, last - QUOTE_FIRST_ROW + 1, 1).getValues().map(function (r) { return r[0]; }) : [];
    // An edited quote (opened from its link) replaces its original row, in whichever month it was made,
    // and keeps its ID, first-saved date, status and notes.
    var id, hit = null;
    var replaceId = String(q.replaceId || '');
    if (/^SD-[A-Z0-9]{6}$/.test(replaceId)) hit = findQuote_(replaceId);
    if (hit) id = replaceId;                                   // edit, or a retry of the same save
    else if (/^SD-[A-Z0-9]{6}$/.test(replaceId)) id = replaceId; // a new quote with the ID the site made
    else { do { id = newId_(); } while (findQuote_(id)); }
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
    var target;
    if (hit) {
      sh = hit.sheet; target = hit.row;
      var old = sh.getRange(target, 2, 1, row.length).getValues()[0];
      row[1] = old[1];                                   // first saved
      row[2] = row[2] || old[2]; row[3] = row[3] || old[3]; row[4] = row[4] || old[4]; // keep the customer if an edit has none
      row[16] = old[16]; row[17] = old[17]; row[18] = old[18]; // status and team notes
      clean.created = old[1] instanceof Date ? old[1].toISOString() : clean.created;
      clean.edited = new Date().toISOString();
      row[19] = JSON.stringify(clean);
    } else {
      // First empty row under the header (column B), so the team can sort freely.
      var gap = -1;
      for (var i = 0; i < ids.length; i++) { if (!ids[i]) { gap = i; break; } }
      target = gap === -1 ? last + 1 : QUOTE_FIRST_ROW + gap;
    }
    sh.getRange(target, 5).setNumberFormat('@'); // phone as text, so the leading 0 stays
    sh.getRange(target, 2, 1, row.length).setValues([row]);
    if (clean.phone) {
      try {
        touchCustomer_(clean.phone, {
          name: clean.name, city: clean.city, quote: !hit,
          tradeIn: row[6], swaps: clean.compare.map(function (c) { return c.name; }).join(', ')
        });
      } catch (e) { /* the quote is saved either way */ }
    }
    return { ok: true, id: id, link: link, created: clean.created };
  } finally {
    lock.releaseLock();
  }
}

function getQuote_(id) {
  if (!/^SD-[A-Z0-9]{6}$/.test(id)) return { ok: false, error: 'Not a quote ID' };
  var hit = findQuote_(id);
  if (!hit) return { ok: false, error: 'Not found' };
  var quote = JSON.parse(hit.sheet.getRange(hit.row, 21).getValue());
  // A quote link can be passed around: never send the customer's name or number with it.
  delete quote.name; delete quote.phone;
  return { ok: true, quote: quote };
}

/** Every quotes tab: the monthly ones ("Quotes Oct 2026") and the original "Quotes" tab if it's still there. */
function quoteTabs_() {
  return SpreadsheetApp.getActive().getSheets().filter(function (sh) { return /^Quotes( [A-Z][a-z]{2} \d{4})?$/.test(sh.getName()); });
}

/** Find a quote ID in any quotes tab (column B). Returns { sheet, row } or null. */
function findQuote_(id) {
  var tabs = quoteTabs_();
  for (var i = tabs.length - 1; i >= 0; i--) {
    var sh = tabs[i];
    var last = sh.getLastRow();
    if (last < QUOTE_FIRST_ROW) continue;
    var f = sh.getRange(QUOTE_FIRST_ROW, 2, last - QUOTE_FIRST_ROW + 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
    if (f) return { sheet: sh, row: f.getRow() };
  }
  return null;
}

/**
 * This month's quotes tab, made on the first save of the month: a copy of the latest quotes tab's
 * headings and layout with no rows. The original "Quotes" tab becomes the first month's tab.
 */
function monthTab_(date) {
  var ss = SpreadsheetApp.getActive();
  var name = 'Quotes ' + Utilities.formatDate(date, ss.getSpreadsheetTimeZone(), 'MMM yyyy');
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  var legacy = ss.getSheetByName('Quotes');
  if (legacy) { legacy.setName(name); return legacy; }
  var tabs = quoteTabs_();
  var from = tabs[tabs.length - 1];
  sh = from.copyTo(ss).setName(name);
  var last = sh.getLastRow();
  if (last >= QUOTE_FIRST_ROW) sh.getRange(QUOTE_FIRST_ROW, 1, last - QUOTE_FIRST_ROW + 1, sh.getMaxColumns()).clearContent();
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(from.getIndex() + 1);
  return sh;
}

// ---------- customers (sign in with name and WhatsApp number) ----------

var CUSTOMER_HEAD = ['WhatsApp Number', 'Name', 'City', 'First Seen', 'Last Seen', 'Quotes', 'Last Trade-In', 'Last Swap Options', 'PIN Set', 'PIN (scrambled)'];

/** 07051111266, 2347051111266, +234 705 111 1266 and 7051111266 (a sheet that dropped the 0) are one number. */
function normPhone_(v) {
  var raw = String(v === undefined || v === null ? '' : v).trim();
  var d = raw.replace(/\D/g, '');
  if (d.indexOf('234') === 0 && d.length === 13) d = '0' + d.slice(3);
  else if (d.length === 10 && /^[789]/.test(d)) d = '0' + d;
  if (/^0[789][01]\d{8}$/.test(d)) return d;
  if (raw.charAt(0) === '+' && d.length >= 8 && d.length <= 15) return '+' + d;
  return '';
}

function customersTab_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Customers');
  if (!sh) {
    sh = ss.insertSheet('Customers');
    sh.getRange(1, 1, 1, CUSTOMER_HEAD.length).setValues([CUSTOMER_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
    sh.hideColumns(10);
  }
  return sh;
}

/** { sheet, row, values } for a number, or null. */
function findCustomer_(phone) {
  var sh = customersTab_();
  var last = sh.getLastRow();
  if (last < 2) return null;
  var vals = sh.getRange(2, 1, last - 1, CUSTOMER_HEAD.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (normPhone_(vals[i][0]) === phone) return { sheet: sh, row: i + 2, values: vals[i] };
  }
  return null;
}

/** Add or update a customer. info: { name, city, quote (true = one more quote), tradeIn, swaps } */
function touchCustomer_(phone, info) {
  var c = findCustomer_(phone);
  var now = new Date();
  var sh = c ? c.sheet : customersTab_();
  var v = c ? c.values.slice() : [phone, '', '', now, now, 0, '', '', 'No', ''];
  // Once a number has a PIN, only someone with the PIN can change its name or city.
  var mayEdit = !v[9] || info.pinOk;
  if (info.name && (mayEdit || !v[1])) v[1] = cut_(info.name, 60);
  if (info.city && (mayEdit || !v[2])) v[2] = cut_(info.city, 40);
  v[4] = now;
  if (info.quote) v[5] = Number(v[5] || 0) + 1;
  if (info.tradeIn) v[6] = cut_(info.tradeIn, 200);
  if (info.swaps) v[7] = cut_(info.swaps, 500);
  if (info.pinHash !== undefined) { v[9] = info.pinHash; v[8] = info.pinHash ? 'Yes' : 'No'; }
  var row = c ? c.row : sh.getLastRow() + 1;
  sh.getRange(row, 1).setNumberFormat('@');
  sh.getRange(row, 1, 1, CUSTOMER_HEAD.length).setValues([v]);
  return v;
}

function customer_(cu) {
  var phone = normPhone_(cu.phone);
  if (!phone) return { ok: false, error: 'Not a phone number' };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var c = findCustomer_(phone);
    var pinOk = !!(c && c.values[9] && cu.pin && pinHash_(phone, String(cu.pin)) === c.values[9]);
    var v = touchCustomer_(phone, { name: cu.name, city: cu.city, pinOk: pinOk });
    return { ok: true, hasPin: !!v[9] };
  } finally { lock.releaseLock(); }
}

function pinHash_(phone, pin) {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('pinSalt');
  if (!salt) { salt = Utilities.getUuid(); props.setProperty('pinSalt', salt); }
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + phone + '|' + pin));
}

/** Wrong PINs: 5 tries, then a 15-minute wait. */
function pinOk_(phone, hash, pin) {
  if (!hash) return { ok: true };
  var cache = CacheService.getScriptCache();
  var key = 'pinfail:' + phone;
  var fails = Number(cache.get(key) || 0);
  if (fails >= 5) return { ok: false, needPin: true, error: 'Too many tries. Try again in 15 minutes.' };
  if (!pin) return { ok: false, needPin: true };
  if (pinHash_(phone, pin) === hash) { cache.remove(key); return { ok: true }; }
  cache.put(key, String(fails + 1), 900);
  return { ok: false, needPin: true, error: 'That PIN doesn’t match.' };
}

/** Sign in on any phone with the WhatsApp number (and the PIN, once the number has one). */
function signIn_(phoneIn, pin) {
  var phone = normPhone_(phoneIn);
  if (!phone) return { ok: false, error: 'Not a phone number' };
  var c = findCustomer_(phone);
  if (!c) return { ok: false, notFound: true };
  var check = pinOk_(phone, c.values[9], pin);
  if (!check.ok) return check;
  return { ok: true, name: String(c.values[1] || ''), city: String(c.values[2] || ''), hasPin: !!c.values[9] };
}

function myCodes_(phoneIn, pin) {
  var phone = normPhone_(phoneIn);
  if (!phone) return { ok: false, error: 'Not a phone number' };
  var c = findCustomer_(phone);
  var check = pinOk_(phone, c ? c.values[9] : '', pin);
  if (!check.ok) return check;
  var codes = [];
  quoteTabs_().forEach(function (sh) {
    var last = sh.getLastRow();
    if (last < QUOTE_FIRST_ROW) return;
    // B id, C date, E phone, H trade-in device, O swap count, P swap options, U the quote itself
    var vals = sh.getRange(QUOTE_FIRST_ROW, 2, last - QUOTE_FIRST_ROW + 1, 20).getValues();
    vals.forEach(function (r) {
      if (!r[0] || normPhone_(r[3]) !== phone) return;
      // The trade-in devices, for "My Devices".
      var devices = [];
      try {
        var qq = JSON.parse(r[19]);
        if (qq.items && qq.items.length > 1) devices = qq.items.map(function (it) { return { id: it.id, name: it.name, value: it.value }; });
        else if (qq.device) devices = [{ id: qq.device.id, name: qq.device.name, value: qq.value }];
      } catch (e) { /* older row */ }
      var swaps = String(r[14] || '').split('\n').filter(String).map(function (x) { return x.split(' · ')[0].split(':')[0]; });
      var dev = String(r[6] || '').split('\n')[0].split(' · ')[0];
      var into = swaps.length === 1 ? swaps[0] : swaps.length ? swaps.length + ' swap options' : '';
      codes.push({ id: String(r[0]), created: r[1] instanceof Date ? r[1].toISOString() : String(r[1]), label: [dev, into].filter(String).join(' → ') || 'Swap Quote', devices: devices });
    });
  });
  codes.sort(function (a, b) { return a.created < b.created ? 1 : -1; });
  return { ok: true, codes: codes.slice(0, 50), hasPin: !!(c && c.values[9]) };
}

function setPin_(phoneIn, pin, oldPin) {
  var phone = normPhone_(phoneIn);
  if (!phone) return { ok: false, error: 'Not a phone number' };
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: 'Use 4 digits.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var c = findCustomer_(phone);
    var check = pinOk_(phone, c ? c.values[9] : '', oldPin);
    if (!check.ok) return { ok: false, error: check.error || 'Type your current PIN first.' };
    touchCustomer_(phone, { pinHash: pinHash_(phone, pin) });
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function describe_(c) {
  var n = '₦' + commas_(c.amount);
  if (c.kind === 'add') return n + ' to swap';
  if (c.kind === 'receive') return 'we pay ' + n;
  if (c.kind === 'even') return 'even swap';
  return 'full price ₦' + commas_(c.price);
}

/** 1785000 → "1,785,000" (Apps Script's formatString doesn't support %,d). */
function commas_(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

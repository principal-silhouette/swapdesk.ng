// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  valueDevice, swapTerms, termsLabel, faultsFor, compareOrder, storageRank, matches, floorTo,
} from '../js/engine.js';

const phone = {
  id: 'iphone-13-pro-128gb-fu', model: 'iPhone 13 Pro', storage: '128gb', condition: 'Foreign USED',
  tradeIn: true, swapInto: true, price: 560000, tradeInValue: 392000,
  deductions: {
    battery: 40000, body: 30000, network: 60000, screen: 120000, backGlass: 50000,
    faceId: 80000, touchId: 'n/a', earpiece: 15000, loudspeaker: 15000, camera: 45000, chargingPort: 20000,
  },
};
const settings = JSON.parse(readFileSync(new URL('../data/catalog-snapshot.json', import.meta.url))).settings;
const good = { battery: 90, neatness: 'prettyNeat', network: 'factory', faults: [] };

// Ten answer sets with hand-worked values (start 392,000).
const cases = [
  ['good condition keeps the full value', good, 392000, []],
  ['battery exactly at threshold: no deduction', { ...good, battery: 85 }, 392000, []],
  ['battery 80–84%: 60% of a new battery', { ...good, battery: 84 }, 368000, [['battery', 24000]]],
  ['battery 79% or less: full new battery', { ...good, battery: 79 }, 352000, [['battery', 40000]]],
  ['a few spots = half body', { ...good, neatness: 'fewSpots' }, 377000, [['body', 15000]]],
  ['pretty rough = 1.5 × body', { ...good, neatness: 'rough' }, 347000, [['body', 45000]]],
  ['chip unlocked = 70% of network', { ...good, network: 'chip' }, 350000, [['network', 42000]]],
  ['eSIM only, unlocked = 40% of network', { ...good, network: 'esim' }, 368000, [['network', 24000]]],
  ['locked = full network', { ...good, network: 'locked' }, 332000, [['network', 60000]]],
  ['no True Tone, blank amount = half screen', { ...good, faults: ['trueTone'] }, 332000, [['trueTone', 60000]]],
  ['bad screen covers True Tone', { ...good, faults: ['screen', 'trueTone'] }, 272000, [['screen', 120000]]],
  ['everything wrong',
    { battery: 70, neatness: 'smallDents', network: 'chip', faults: ['screen', 'backGlass', 'faceId'] },
    392000 - 40000 - 30000 - 42000 - 120000 - 50000 - 80000, null],
];

for (const [name, answers, expected, lines] of cases) {
  test(name, () => {
    const r = valueDevice(phone, answers, settings);
    assert.equal(r.accepted, true);
    assert.equal(r.value, expected);
    if (lines) assert.deepEqual(r.lines.map((l) => [l.key, l.amount]), lines);
  });
}

test('final value rounds down to ₦1,000 and never goes below 0', () => {
  const odd = { ...phone, tradeInValue: 100000, deductions: { ...phone.deductions, body: 3333 } };
  assert.equal(valueDevice(odd, { ...good, neatness: 'fewSpots' }, settings).value, 98000); // 100000 − 1667 → 98,333 → 98,000
  assert.equal(valueDevice(odd, { ...good, faults: ['screen', 'faceId'] }, settings).value, 0);
  assert.equal(floorTo(12500, 1000), 12000);
});

test('iCloud locked stops the quote', () => {
  const r = valueDevice(phone, { ...good, icloudLocked: true }, settings);
  assert.equal(r.accepted, false);
  assert.match(r.reason, /iCloud/);
});

test('no trade-in value or not accepted stops the quote', () => {
  assert.equal(valueDevice({ ...phone, tradeInValue: null }, good, settings).accepted, false);
  assert.equal(valueDevice({ ...phone, tradeIn: false }, good, settings).accepted, false);
});

test('unpriced faults show as checked-in-store lines', () => {
  const blank = { ...phone, deductions: { touchId: 'n/a' } };
  const r = valueDevice(blank, { ...good, battery: 80, faults: ['camera'] }, settings);
  assert.equal(r.value, 392000);
  assert.equal(r.pending, 2);
  assert.deepEqual(r.lines.map((l) => l.amount), [null, null]);
});

test('n/a faults are never asked or charged', () => {
  assert.ok(!faultsFor(phone).some((f) => f.key === 'touchId'));
  const r = valueDevice(phone, { ...good, faults: ['touchId'] }, settings);
  assert.equal(r.lines.length, 0);
  assert.ok(!faultsFor({ deductions: {} }, { includeUnpriced: false }).length);
});

test('swap terms: add, receive, even, never negative', () => {
  assert.deepEqual(swapTerms({ price: 500000 }, 392000), { kind: 'add', amount: 108000, price: 500000 });
  assert.deepEqual(swapTerms({ price: 380000 }, 392000), { kind: 'receive', amount: 12000, price: 380000 });
  assert.equal(swapTerms({ price: 392000 }, 392000).kind, 'even');
  assert.equal(termsLabel(swapTerms({ price: 392000 }, 392000)), 'Even swap');
  assert.equal(swapTerms({ price: null }, 1).kind, 'unavailable');
});

test('compare order: model, condition, storage', () => {
  const order = new Map([['iPhone 16', 0], ['iPhone 15', 1]]);
  const list = [
    { model: 'iPhone 15', condition: 'Brand New', storage: '128gb' },
    { model: 'iPhone 16', condition: 'Foreign USED', storage: '128gb' },
    { model: 'iPhone 16', condition: 'Brand New', storage: '512gb' },
    { model: 'iPhone 16', condition: 'Brand New', storage: '1tb' },
    { model: 'iPhone 16', condition: 'Brand New', storage: '256gb' },
  ].sort(compareOrder(order));
  assert.deepEqual(list.map((d) => `${d.model} ${d.condition} ${d.storage}`), [
    'iPhone 16 Brand New 256gb', 'iPhone 16 Brand New 512gb', 'iPhone 16 Brand New 1tb',
    'iPhone 16 Foreign USED 128gb', 'iPhone 15 Brand New 128gb',
  ]);
  assert.equal(storageRank('8/256gb'), 256);
});

test('search needs every word', () => {
  const d = { brand: 'Apple', series: 'iPhone 16', model: 'iPhone 16 Pro Max', storage: '256gb', condition: 'Foreign USED' };
  assert.ok(matches(d, '16 pro max 256'));
  assert.ok(!matches(d, '16 pro max 512'));
});

test('replaced screen = 20% of device value (the True Tone figure), covers True Tone, never stacks with a faulty screen', () => {
  const r1 = valueDevice(phone, { ...good, faults: ['screenReplaced', 'trueTone'] }, settings);
  assert.deepEqual(r1.lines.map((l) => [l.key, l.amount]), [['screenReplaced', 112000]]); // 20% of ₦560,000
  const r3 = valueDevice({ ...phone, deductions: { ...phone.deductions, trueTone: 70000 } }, { ...good, faults: ['screenReplaced'] }, settings);
  assert.equal(r3.lines[0].amount, 70000);
  const r2 = valueDevice(phone, { ...good, faults: ['screen', 'screenReplaced'] }, settings);
  assert.deepEqual(r2.lines.map((l) => l.key), ['screen']);
});

test('replaced battery = 60% of a new battery, not charged again when battery health is already low', () => {
  const r1 = valueDevice(phone, { ...good, faults: ['batteryReplaced'] }, settings);
  assert.deepEqual(r1.lines.map((l) => [l.key, l.amount]), [['batteryReplaced', 24000]]); // 60% of 40,000
  const r2 = valueDevice(phone, { ...good, battery: 80, faults: ['batteryReplaced'] }, settings);
  assert.deepEqual(r2.lines.map((l) => [l.key, l.amount]), [['battery', 24000]]);
  assert.ok(!faultsFor({ deductions: { battery: 'n/a' } }).some((f) => f.key === 'batteryReplaced'));
});

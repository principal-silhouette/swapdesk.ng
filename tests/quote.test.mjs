import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeQuote, decodeQuote, summaryText, whatsappMessage } from '../js/quote.js';

const q = {
  v: 1, created: '2026-09-30T12:00:00.000Z',
  device: { id: 'iphone-13-pro-128gb-fu', name: 'iPhone 13 Pro · 128gb · Foreign USED', start: 392000 },
  answers: { icloudLocked: false, battery: 84, neatness: 'fewSpots', network: 'chip', faults: ['screen', 'faceId'] },
  value: 250000, lines: [['Battery health 84%', 40000], ['Face ID', null]],
  compare: Array.from({ length: 6 }, (_, i) => ({ id: `dev-${i}`, name: `iPhone 17 Pro Max · 256gb · Brand New ${i}`, price: 2000000 + i, kind: 'add', amount: 1750000 + i, dealNote: i ? '' : 'Foreign USED · No Face ID' })),
  city: 'Port Harcourt',
};

test('fallback link round-trips a six-device quote', () => {
  const s = encodeQuote(q);
  assert.deepEqual(decodeQuote(s), q);
  assert.ok(s.length < 1400, `link payload ${s.length} chars`);
});

test('summary and WhatsApp text read cleanly, no minus signs or decimals', () => {
  const t = whatsappMessage(q, 'https://swapdesk.ng/?q=SD-ABC234', 'Port Harcourt');
  assert.match(t, /Value: ₦ 250K/);
  assert.match(t, /₦ 1\.75M to Swap/);
  assert.doesNotMatch(t, /you add|you pay/i);
  assert.match(t, /\?q=SD-ABC234/);
  assert.doesNotMatch(t, /-₦|\.00\b/);
  const r = summaryText({ ...q, compare: [{ ...q.compare[0], kind: 'receive', amount: 12000 }] }, '');
  assert.match(r, /You get ₦ 12K back/);
});

// Site settings. Prices live in the Google Sheet, not here.
export const CONFIG = {
  // Apps Script web app URL (ends in /exec). Empty = use the built-in snapshot only.
  endpoint: 'https://script.google.com/macros/s/AKfycbxzQrWPBr0arYZgp5kCF48qTE-uNG8_iHEAyC3R6AttBNukQBz9E5wlF9sI9_h0E2jn/exec',
  snapshot: 'data/catalog-snapshot.json',
  // Links in shared quotes and lists point at wherever the site is running (swapdesk.ng in production).
  site: typeof location !== 'undefined' && /^https?:$/.test(location.protocol)
    ? location.origin + location.pathname.replace(/[^/]*$/, '')
    : 'https://swapdesk.ng/',
  whatsapp: '2347037853959',
  whatsappDisplay: '0703 785 3959',
  instagram: 'the.swapdesk',
  quoteValidDays: 7,
  // Types customers can trade in or swap into. Everything priced still shows on the Price List.
  swapTypes: ['Phones', 'Tablets', 'Watches', 'AirPods', 'Games'],
  // Shown at the top of the Shop list for that brand, with no price, until the Sheet has them.
  comingSoon: [{ type: 'Phones', brand: 'Apple', model: 'iPhone Duo' }],
  // Ask about faults the sheet hasn't priced yet for a model (checked in store).
  showUnpricedFaults: true,
  gaId: '',
};

export const CITIES = [
  {
    key: 'ph', name: 'Port Harcourt',
    text: 'Complete your swap in person at our Experience Lounge in Garrison, Port Harcourt.',
  },
  {
    key: 'yenagoa', name: 'Yenagoa',
    text: 'Place your swap order with us on WhatsApp. Your new device is delivered to our partner service centre in Yenagoa within 48 hours, where you complete the swap.',
  },
  {
    key: 'uyo', name: 'Uyo',
    text: 'Place your swap order with us on WhatsApp. Your new device is delivered to our partner service centre in Uyo within 48 hours, where you complete the swap.',
  },
  {
    key: 'abuja', name: 'Abuja',
    text: 'Complete your swap at our partner service centre in Banex Plaza. We’ll connect you and walk you through it.',
  },
  {
    key: 'lagos', name: 'Lagos',
    text: 'Complete your swap at our partner service centre in Computer Village. We’ll connect you and walk you through it.',
  },
  {
    key: 'other', name: 'Other',
    text: 'Waybill your device to us in Port Harcourt. We check it, confirm the final value and send your new device back.',
  },
];

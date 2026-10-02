// Inline SVG icons (stroke = currentColor).
const s = (d, vb = '0 0 24 24', extra = '') => `<svg class="ico" viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const ICON = {
  search: s('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  clear: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor" opacity=".45"/><path d="M7 7l6 6M13 7l-6 6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
  chevron: '<svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  x: s('<path d="M6 6l12 12M18 6L6 18"/>'),
  share: s('<path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>'),
  copy: s('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  print: s('<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>'),
  download: s('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>'),
  tiktok: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
  link: s('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  edit: s('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  whatsapp: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>',
  Phones: s('<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 5h3"/>'),
  Tablets: s('<rect x="4" y="2.5" width="16" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  Watches: s('<rect x="6" y="6" width="12" height="12" rx="3.5"/><path d="M9 6l.7-3.5h4.6L15 6M9 18l.7 3.5h4.6L15 18"/>'),
  AirPods: s('<path d="M8 3a3 3 0 0 0-3 3v2a3 3 0 0 0 2 2.8V20a1.5 1.5 0 0 0 3 0V6a3 3 0 0 0-2-3zM16 3a3 3 0 0 1 3 3v2a3 3 0 0 1-2 2.8V20a1.5 1.5 0 0 1-3 0V6a3 3 0 0 1 2-3z"/>'),
  Speakers: s('<rect x="3" y="7" width="18" height="10" rx="5"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/>'),
};

/** Small phone illustrations for the five neatness grades. */
export function neatnessIllo(level) {
  const marks = [
    '',
    '<path d="M20 12l3 1"/>',
    '<path d="M9 14l5 2M22 34l4-3M13 44l3 1"/>',
    '<path d="M8 12l7 3M22 30l5-5M11 44l5-1"/><path d="M4 22a3 3 0 0 0 3 3" stroke-width="2.4"/><path d="M32 40a3 3 0 0 1-3 3" stroke-width="2.4"/>',
    '<path d="M8 10l10 6 4-2M24 26l-9 7 5 6M9 45l6-4 5 3"/><path d="M4 18a4 4 0 0 0 3 5M4 35a3 3 0 0 0 3 3M32 14a3 3 0 0 1-3 3M32 42a4 4 0 0 1-4 3" stroke-width="2.4"/>',
  ][level] || '';
  return `<svg class="illo" viewBox="0 0 36 52" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="28" height="48" rx="6" stroke-width="2"/>${marks}</svg>`;
}

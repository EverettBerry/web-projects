// Flipp hosts most US grocery circulars. This is its public web backend,
// which has no documented API, so failures are reported to the page as
// "ad unavailable" and the screenshot option stays available.
const BASE = 'https://backflipp.wishabi.com/flipp';
const HEADERS = { accept: 'application/json' };

export async function grocerFlyers(zip) {
  const res = await fetch(`${BASE}/flyers?locale=en-us&postal_code=${zip}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Flipp flyers ${res.status}`);
  const data = await res.json();
  return (data.flyers || [])
    .filter(f => (f.categories || []).includes('Groceries'))
    .map(f => ({
      id: f.id,
      merchant: String(f.merchant || '').trim(),
      name: String(f.name || '').trim(),
      validFrom: f.valid_from,
      validTo: f.valid_to,
    }));
}

export async function flyerItems(id) {
  const res = await fetch(`${BASE}/flyers/${id}?locale=en-us`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Flipp flyer ${res.status}`);
  const data = await res.json();
  return (data.items || []).map(i => ({
    name: String(i.name || '').trim(),
    price: i.price ? String(i.price) : '',
    notes: [i.pre_price_text, i.post_price_text, i.sale_story].filter(Boolean).join(' ').trim(),
    validTo: i.valid_to,
  })).filter(i => i.name);
}

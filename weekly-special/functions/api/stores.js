import { grocerFlyers } from '../_lib/flipp.js';
import { json } from '../_lib/extract.js';

// GET /api/stores?zip=07030 -> grocery circulars available near a ZIP code.
export async function onRequestGet({ request }) {
  const zip = new URL(request.url).searchParams.get('zip') || '';
  if (!/^\d{5}$/.test(zip)) return json({ error: 'Enter a 5-digit ZIP code.' }, 400);
  try {
    return json({ flyers: await grocerFlyers(zip) }, 200, { 'cache-control': 'public, max-age=3600' });
  } catch (err) {
    return json({ error: "Couldn't load the store list right now." }, 502);
  }
}

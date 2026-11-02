import { grocerFlyers } from '../_lib/flipp.js';
import { shopRiteFlyers } from '../_lib/lrwc.js';
import { json } from '../_lib/extract.js';

// GET /api/stores?zip=07030 -> grocery circulars available near a ZIP code.
export async function onRequestGet({ request }) {
  const zip = new URL(request.url).searchParams.get('zip') || '';
  if (!/^\d{5}$/.test(zip)) return json({ error: 'Enter a 5-digit ZIP code.' }, 400);
  // ShopRite comes from a deal blog, not Flipp; either source can fail on its own.
  const [flipp, shoprite] = await Promise.allSettled([grocerFlyers(zip), shopRiteFlyers()]);
  if (flipp.status === 'rejected' && shoprite.status === 'rejected') {
    return json({ error: "Couldn't load the store list right now." }, 502);
  }
  const flyers = [
    ...(flipp.status === 'fulfilled' ? flipp.value : []),
    ...(shoprite.status === 'fulfilled' ? shoprite.value : []),
  ];
  return json({ flyers }, 200, { 'cache-control': 'public, max-age=3600' });
}

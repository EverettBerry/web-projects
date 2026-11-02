import { flyerItems } from '../_lib/flipp.js';
import { shopRiteItems } from '../_lib/lrwc.js';
import { checkCode, extractItems, ExtractError, json, LIST_PROMPT } from '../_lib/extract.js';
import { ITEMS } from '../../public/catalog.js';

// Words that suggest an ad item could be a recipe ingredient. Only those
// items go to Claude for matching and unit conversion; the rest are listed as is.
const TERMS = ITEMS.flatMap(i => [i[1].toLowerCase().replace(/\s*\(.*\)/, ''), ...i[7].split('|')]);
const looksLikeIngredient = name => {
  const s = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  return TERMS.some(t => s.includes(` ${t} `) || s.includes(` ${t}s `));
};

const dollars = p => (!p ? '' : p.includes('$') ? p : `$${p}`);

// GET /api/ad?flyer=123&store=Stop%20%26%20Shop -> sale items from one circular.
// Flipp circulars have numeric ids; ShopRite weeks from the deal blog are "lrwc-<post id>".
export async function onRequestGet({ request, env, waitUntil }) {
  const denied = checkCode(request, env);
  if (denied) return denied;
  const url = new URL(request.url);
  const flyer = url.searchParams.get('flyer') || '';
  const store = (url.searchParams.get('store') || 'grocery store').slice(0, 60);
  if (!/^(lrwc-)?\d{1,12}$/.test(flyer)) return json({ error: 'Pick a weekly ad first.' }, 400);

  // A circular doesn't change during its week, so each one is read once.
  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/api/ad-cache/${flyer}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let raw;
  try {
    raw = flyer.startsWith('lrwc-') ? await shopRiteItems(flyer.slice(5)) : await flyerItems(flyer);
  } catch (err) {
    return json({ error: "Couldn't load that weekly ad right now. Try again later, or use screenshots." }, 502);
  }
  const candidates = raw.map((r, id) => ({ ...r, id })).filter(r => looksLikeIngredient(r.name)).slice(0, 200);
  const others = raw.filter(r => !looksLikeIngredient(r.name));

  let matched = [];
  if (candidates.length) {
    const lines = candidates.map(c => `${c.id} | ${c.name} | ${dollars(c.price) || 'no price'} | ${c.notes}`).join('\n');
    try {
      matched = await extractItems(env, [{ type: 'text', text: LIST_PROMPT(store, lines) }], 'low');
    } catch (err) {
      if (err instanceof ExtractError) return json({ error: err.message }, err.status);
      throw err;
    }
  }
  const items = [
    ...matched.map(({ id, ...m }) => m),
    ...others.map(o => ({ name: o.name, deal: dollars(o.price) || o.notes || 'See ad', key: null, sale: Number(o.price) || null, regular: null })),
  ];
  const validTo = raw.map(r => r.validTo).filter(Boolean).sort()[0] || null;
  const res = json({ items, validTo }, 200, { 'cache-control': 'public, max-age=21600' });
  waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

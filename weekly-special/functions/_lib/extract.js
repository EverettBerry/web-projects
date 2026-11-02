import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { ITEMS } from '../../public/catalog.js';

const KEYS = new Set(ITEMS.map(i => i[0]));

const Result = z.object({
  items: z.array(z.object({
    id: z.number().nullable(),
    name: z.string(),
    deal: z.string(),
    key: z.string().nullable(),
    sale: z.number().nullable(),
    regular: z.number().nullable(),
  })),
});

export class ExtractError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const RULES = `For each item give:
- id: the line's id when reading a list, otherwise null
- name: short item name as the ad says it
- deal: the price as printed (e.g. "2 for $5", "$1.99 lb")
- key: the matching ingredient key from the list below, or null if none fits
- sale: the sale price as a number
- regular: the regular price as a number, or null if the ad doesn't show one
When "key" is set, convert "sale" and "regular" to that ingredient's unit: "2 for $5" is 2.50 each; a 3 lb bag for $2.99 is 1.00 per lb; buy one get one free is half price. Meat, poultry, seafood and loose produce priced without a unit are per lb. When "key" is null, give the price for one item.
Include deals that need the store card or a digital coupon.

Ingredient keys (key: name, unit):
${ITEMS.map(i => `${i[0]}: ${i[1]}, per ${i[2]}`).join('\n')}`;

export const IMAGE_PROMPT = store => `The ${store || 'grocery store'} weekly sale ad is attached as screenshots, pasted text, or both. List every food item on sale.\n\n${RULES}`;

export const LIST_PROMPT = (store, lines) => `This is a list of items from the ${store} weekly sale ad, one per line as "id | name | price | price notes". Return one item for every line.\n\n${RULES}\n\nAd items:\n${lines}`;

// Sends the ad (images or a text list) to Claude and returns cleaned items.
export async function extractItems(env, content, effort) {
  if (!env.ANTHROPIC_API_KEY) throw new ExtractError(500, 'The site is missing its Anthropic API key.');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let msg;
  try {
    msg = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort, format: betaZodOutputFormat(Result) },
      messages: [{ role: 'user', content }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new ExtractError(429, 'Too many requests right now. Try again in a few minutes.');
    if (err instanceof Anthropic.AuthenticationError) throw new ExtractError(500, "The site's Anthropic API key isn't valid.");
    if (err instanceof Anthropic.BadRequestError) throw new ExtractError(400, "Claude couldn't read that. Try fewer or smaller screenshots.");
    if (err instanceof Anthropic.APIError) throw new ExtractError(502, "Couldn't reach Claude. Try again in a minute.");
    throw err;
  }
  if (msg.stop_reason === 'refusal') throw new ExtractError(422, "Claude couldn't read that ad. Try different screenshots.");
  if (msg.stop_reason === 'max_tokens') throw new ExtractError(413, 'That ad was too long to read at once. Try fewer screenshots.');
  const items = msg.parsed_output ? msg.parsed_output.items : [];
  return items.map(x => ({
    id: x.id,
    name: x.name.slice(0, 100),
    deal: x.deal.slice(0, 40),
    key: x.key && KEYS.has(x.key) ? x.key : null,
    sale: x.sale > 0 ? x.sale : null,
    regular: x.regular > 0 ? x.regular : null,
  })).filter(x => x.name);
}

export function checkCode(request, env) {
  if (!env.SITE_CODE) return null;
  if (request.headers.get('x-site-code') === env.SITE_CODE) return null;
  return json({ error: 'Enter the access code on the Your Kitchen tab.' }, 401);
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

import { checkCode, extractItems, ExtractError, IMAGE_PROMPT, json } from '../_lib/extract.js';

const MAX_IMAGES = 8;
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function base64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// POST /api/read-ad (multipart: images[], text, store) -> sale items read by Claude.
export async function onRequestPost({ request, env }) {
  const denied = checkCode(request, env);
  if (denied) return denied;
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Send screenshots or ad text.' }, 400);
  }
  const store = String(form.get('store') || '').slice(0, 60);
  const text = String(form.get('text') || '').slice(0, 60000);
  const files = form.getAll('images').filter(f => typeof f === 'object');
  if (!files.length && !text.trim()) return json({ error: 'Add screenshots of the ad or paste its text.' }, 400);
  if (files.length > MAX_IMAGES) return json({ error: `Send at most ${MAX_IMAGES} screenshots at a time.` }, 400);

  const content = [];
  for (const f of files) {
    if (!TYPES.includes(f.type)) return json({ error: 'Screenshots must be JPG, PNG, WebP or GIF.' }, 400);
    if (f.size > MAX_BYTES) return json({ error: 'One screenshot is too large. Each must be under 5 MB.' }, 400);
    content.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: base64(await f.arrayBuffer()) } });
  }
  content.push({ type: 'text', text: IMAGE_PROMPT(store) + (text.trim() ? `\n\nThe ad text:\n${text}` : '') });

  try {
    return json({ items: await extractItems(env, content, 'medium') });
  } catch (err) {
    if (err instanceof ExtractError) return json({ error: err.message }, err.status);
    throw err;
  }
}

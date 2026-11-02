// ShopRite doesn't publish its circular through Flipp, and its own site blocks
// automated visits. Living Rich With Coupons, a New Jersey deal blog, posts the
// full ShopRite ad as text every week ("ShopRite Coupon Deals – Week of 11/1").
// We read those posts through the blog's public WordPress API. Results are cached,
// so the blog sees a couple of requests per week (its robots.txt allows this).
const API = 'https://www.livingrichwithcoupons.com/wp-json/wp/v2/posts';
const HEADERS = { accept: 'application/json', 'user-agent': 'WeeklySpecial/1.0 (personal meal planner)' };
const TITLE = /^ShopRite Coupon Deals\s*[–-]\s*Week of (\d{1,2})\/(\d{1,2})/i;

const decode = s => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#039;|&rsquo;|&lsquo;/g, "'").replace(/&ndash;/g, '–').replace(/&mdash;/g, '—');

// Week start date from "Week of 11/1", placed in the year the post was published
// (or the next one, for a January ad posted in December).
function weekStart(match, published) {
  const pub = new Date(published);
  let start = new Date(Date.UTC(pub.getUTCFullYear(), Number(match[1]) - 1, Number(match[2])));
  if (start < pub - 60 * 864e5) start = new Date(Date.UTC(pub.getUTCFullYear() + 1, Number(match[1]) - 1, Number(match[2])));
  return start;
}

// The current and upcoming ShopRite ads, newest first, as "flyers".
export async function shopRiteFlyers() {
  const url = `${API}?search=${encodeURIComponent('ShopRite Coupon Deals Week of')}&per_page=20&_fields=id,date,title,link`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`LRWC posts ${res.status}`);
  const now = Date.now();
  return (await res.json())
    .map(p => {
      const m = decode(p.title.rendered).match(TITLE);
      if (!m) return null;
      const start = weekStart(m, p.date);
      const end = new Date(start.getTime() + 7 * 864e5 - 1000);
      return { id: `lrwc-${p.id}`, merchant: 'ShopRite', name: `Week of ${m[1]}/${m[2]}`, validFrom: start.toISOString(), validTo: end.toISOString(), source: p.link };
    })
    .filter(f => f && new Date(f.validTo).getTime() > now)
    .slice(0, 2);
}

// Item lines from one post: "Broccoli Crowns — $1.69/lb (Limit 4 lbs)", plus any
// eCoupon "Final Price" lines that follow an item.
export async function shopRiteItems(postId) {
  const res = await fetch(`${API}/${postId}?_fields=content`, { headers: HEADERS });
  if (!res.ok) throw new Error(`LRWC post ${res.status}`);
  const html = (await res.json()).content.rendered;
  const lines = decode(html.replace(/<br\s*\/?>|<\/(p|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ''))
    .split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    const m = line.match(/^(.+?)\s+[—–]\s+(.*\$.*)$/);
    if (m && m[1].length < 220) {
      items.push({ name: m[1], price: m[2].replace(/\(Limit[^)]*\)/i, '').trim(), notes: '' });
    } else if (items.length && /^Final Price:/i.test(line)) {
      items[items.length - 1].notes = `with eCoupon: ${line.replace(/^Final Price:\s*/i, '')}`;
    }
  }
  return items;
}

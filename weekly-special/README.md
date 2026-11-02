# The Weekly Special

Turns a grocery store's weekly sale ad into a week of dinners, a shopping list and a savings total.

- `public/` is the site: `index.html` (the whole app) and `catalog.js` (ingredients and typical prices).
- `functions/api/` are Cloudflare Pages Functions:
  - `stores` lists grocery circulars near a ZIP code, from Flipp.
  - `ad` loads one circular from Flipp and has Claude match its items to recipe ingredients.
  - `read-ad` reads uploaded ad screenshots (or pasted ad text) with Claude, for stores Flipp doesn't carry, like ShopRite.

Flipp has no documented public API. If it changes, the automatic ads stop loading and the screenshot option still works.

## Deploy on Cloudflare Pages

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git** and pick `EverettBerry/web-projects`.
2. Build settings:
   - Production branch: the branch this code is on
   - Root directory: `weekly-special`
   - Build command: `npm install`
   - Build output directory: `public`
3. Under **Settings → Variables and Secrets**, add two secrets:
   - `ANTHROPIC_API_KEY`: an API key from console.anthropic.com
   - `SITE_CODE`: any short code. The site asks for it on the Your Kitchen tab, so strangers can't spend your API credit.
4. Deploy. Every push to the branch redeploys.

## Costs

Each ad load or screenshot read is one Claude Opus 5.5 request, roughly 10 to 15 cents. Hosting is free on Cloudflare's free plan.

## Run locally

```
npm install
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .dev.vars
echo 'SITE_CODE=test' >> .dev.vars
npm run dev
```

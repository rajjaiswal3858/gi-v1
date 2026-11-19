// One-off: mirrors the extra "Load More" pages of the listing widgets so the button works offline.
// For every page whose source contains an Elementor load-more anchor, walks the paginated URLs on
// the reference site, saves each page's items as an HTML fragment and downloads their images.
// Output: public/assets/data/loadmore/<slug>-<n>.html
// Run:  node scripts/fetch-loadmore.mjs
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const outDir = path.join(pub, 'assets', 'data', 'loadmore');
const ORIGIN = 'https://hatchworks.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function get(url, as = 'text') {
  // polite: sequential, throttled, and backs off when the server says 429
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 6; i++) {
    await sleep(350);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 429 || r.status >= 500) { await sleep(20000 * (i + 1)); continue; }
      if (!r.ok) return null;
      return as === 'text' ? await r.text() : Buffer.from(await r.arrayBuffer());
    } catch {
      await sleep(3000 * (i + 1));
    }
  }
  return null;
}

const anchorRe = /<div class="e-load-more-anchor" data-page="(\d+)" data-max-page="(\d+)" data-next-page="([^"]*)"/g;
const containerRe = /<div class="[^"]*(?:elementor-loop-container|elementor-posts-container)[^"]*"[^>]*>/g;

// the items sit between the listing container's opening tag and the </div> right before the anchor
function itemsBefore(html, anchorIdx) {
  let open = null;
  for (const m of html.matchAll(containerRe)) {
    if (m.index > anchorIdx) break;
    open = m;
  }
  if (!open) return null;
  const start = open.index + open[0].length;
  const end = html.lastIndexOf('</div>', anchorIdx);
  return end > start ? html.slice(start, end) : null;
}

async function mirrorAssets(fragment) {
  const urls = new Set();
  for (const m of fragment.matchAll(/(?:https?:\/\/(?:www\.)?hatchworks\.com)?(\/wp-content\/uploads\/[^"'\s)<>]+)/g)) urls.add(m[1].replace(/&amp;/g, '&'));
  let n = 0;
  for (const u of urls) {
    const file = path.join(pub, decodeURIComponent(u.split(/[?#]/)[0]));
    if (existsSync(file)) continue;
    const buf = await get(ORIGIN + u, 'buffer');
    if (!buf) continue;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buf);
    n++;
  }
  return n;
}

await mkdir(outDir, { recursive: true });
const files = (await readdir(path.join(root, 'src', 'pages'))).filter((f) => f.endsWith('.html'));
for (const f of files) {
  const src = await readFile(path.join(root, 'src', 'pages', f), 'utf8');
  const anchors = [...src.matchAll(anchorRe)];
  if (!anchors.length) continue;
  const slug = f.replace(/\.html$/, '');
  for (let ai = 0; ai < anchors.length; ai++) {
    let next = anchors[ai][3].replace(/&amp;/g, '&');
    const max = +anchors[ai][2];
    for (let page = 2; page <= max && next; page++) {
      const html = await get(next);
      if (!html) break;
      const found = [...html.matchAll(anchorRe)][ai];
      if (!found) break;
      let frag = itemsBefore(html, found.index);
      if (!frag) break;
      const got = await mirrorAssets(frag);
      frag = frag.replace(/https?:\/\/(?:www\.)?hatchworks\.com(\/wp-content\/)/g, '$1');
      const name = `${slug}${anchors.length > 1 ? '-' + ai : ''}-${page}.html`;
      await writeFile(path.join(outDir, name), frag.trim() + '\n');
      console.log(`${name}: ${(frag.match(/<article|e-loop-item /g) || []).length} items, ${got} new assets`);
      next = found[3].replace(/&amp;/g, '&');
    }
  }
}

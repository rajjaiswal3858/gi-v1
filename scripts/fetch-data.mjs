// One-off: snapshots the public WordPress REST data the pages query at runtime, so listing,
// search and filter interactions work without a backend. Polite: sequential and throttled.
//   public/assets/data/wp/categories.json     all categories (id, slug, name, count)
//   public/assets/data/wp/case-studies.json   pages in category "case-studies" (shape the page expects)
//   public/assets/data/wp/posts.json          slim index of every blog post
// Featured images are downloaded next to the rest of the mirrored uploads.
// Run:  node scripts/fetch-data.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
const outDir = path.join(pub, 'assets', 'data', 'wp');
const ORIGIN = 'https://hatchworks.com';
const API = ORIGIN + '/wp-json/wp/v2';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, as = 'json') {
  for (let i = 0; i < 6; i++) {
    await sleep(350);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 429 || r.status >= 500) { await sleep(20000 * (i + 1)); continue; }
      if (!r.ok) return null;
      if (as === 'json') return { body: await r.json(), pages: +(r.headers.get('x-wp-totalpages') || 1) };
      return Buffer.from(await r.arrayBuffer());
    } catch {
      await sleep(3000 * (i + 1));
    }
  }
  return null;
}

const routes = new Set(JSON.parse(await readFile(path.join(root, 'src', 'pages.json'), 'utf8')).map((p) => p.route));
const toLocalPath = (url) => (url || '').replace(/^https?:\/\/(?:www\.)?hatchworks\.com/, '');
// page links become local only when that page is mirrored
const localLink = (url) => { const p = toLocalPath(url).split(/[?#]/)[0]; return routes.has(p) ? p : url; };

let downloaded = 0;
async function mirror(url) {
  const p = toLocalPath(url);
  if (!p.startsWith('/wp-content/')) return url;
  const file = path.join(pub, decodeURIComponent(p.split(/[?#]/)[0]));
  if (!existsSync(file)) {
    const buf = await get(ORIGIN + p, 'buffer');
    if (!buf) return url; // keep the remote URL if it cannot be fetched
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buf);
    downloaded++;
  }
  return p;
}

const pickSize = (media, order) => {
  const sizes = media?.media_details?.sizes || {};
  for (const k of order) if (sizes[k]?.source_url) return sizes[k];
  return media?.source_url ? { source_url: media.source_url, width: media.media_details?.width, height: media.media_details?.height } : null;
};

await mkdir(outDir, { recursive: true });

// ---- categories ----
const cats = [];
for (let page = 1; ; page++) {
  const r = await get(`${API}/categories?per_page=100&page=${page}&_fields=id,slug,name,count,parent`);
  if (!r) break;
  cats.push(...r.body);
  if (page >= r.pages) break;
}
await writeFile(path.join(outDir, 'categories.json'), JSON.stringify(cats));
console.log('categories:', cats.length);

// ---- case studies (kept in the WP REST shape the case-studies page reads) ----
const csCat = cats.find((c) => c.slug === 'case-studies');
if (csCat) {
  const r = await get(`${API}/pages?categories=${csCat.id}&per_page=100&_embed=1&orderby=date&order=desc`);
  const out = [];
  for (const p of r?.body || []) {
    const media = p._embedded?.['wp:featuredmedia']?.[0];
    const size = pickSize(media, ['medium_large', 'large', 'full']);
    const img = size ? await mirror(size.source_url) : '';
    out.push({
      id: p.id,
      link: localLink(p.link),
      date: p.date,
      title: { rendered: p.title?.rendered || '' },
      _embedded: {
        'wp:featuredmedia': img ? [{ source_url: img, media_details: { sizes: { medium_large: { source_url: img } } } }] : [],
        'wp:term': (p._embedded?.['wp:term'] || []).map((tx) => tx.map((t) => ({ name: t.name, slug: t.slug, taxonomy: t.taxonomy }))),
      },
    });
  }
  await writeFile(path.join(outDir, 'case-studies.json'), JSON.stringify(out));
  console.log('case studies:', out.length);
}

// ---- blog post index ----
const posts = [];
for (let page = 1; ; page++) {
  const r = await get(`${API}/posts?per_page=50&page=${page}&_embed=wp:featuredmedia,author&orderby=date&order=desc`);
  if (!r) break;
  for (const p of r.body) {
    const media = p._embedded?.['wp:featuredmedia']?.[0];
    const size = pickSize(media, ['medium_large', 'large', 'full']);
    const img = size ? await mirror(size.source_url) : '';
    posts.push({
      id: p.id,
      link: localLink(p.link),
      date: p.date,
      title: p.title?.rendered || '',
      excerpt: (p.excerpt?.rendered || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 220),
      cats: p.categories || [],
      tags: p.tags || [],
      author: p._embedded?.author?.[0]?.name || '',
      authorLink: p._embedded?.author?.[0]?.link || '',
      classes: (p.class_list || []).filter((c) => /^(category|tag)-/.test(c)).join(' '),
      img,
      iw: size?.width || 0,
      ih: size?.height || 0,
      alt: media?.alt_text || '',
    });
  }
  console.log(`posts: page ${page}/${r.pages}, total ${posts.length}, images downloaded ${downloaded}`);
  await writeFile(path.join(outDir, 'posts.json'), JSON.stringify(posts));
  if (page >= r.pages) break;
}
console.log('done. posts:', posts.length, 'new images:', downloaded);

// ---- blog listing membership ----
// The blog grid shows a subset of posts (its own query). Walk its server-rendered pages once to
// record exactly which posts it lists, in order, so the local filters work on the same set.
const blogIds = [];
for (let page = 1; page <= 60; page++) {
  await sleep(350);
  const r = await fetch(`${ORIGIN}/resources/blog/?jsf=epro-loop-builder&pagenum=${page}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) break;
  const html = await r.text();
  const ids = [...html.matchAll(/e-loop-item e-loop-item-(\d+)/g)].map((m) => +m[1]).filter((id) => !blogIds.includes(id));
  if (!ids.length) break;
  blogIds.push(...ids);
  const max = +(html.match(/"max_num_pages":(\d+)/) || [])[1] || 1;
  if (page >= max) break;
}
await writeFile(path.join(outDir, 'blog-order.json'), JSON.stringify(blogIds));
console.log('blog listing posts:', blogIds.length);

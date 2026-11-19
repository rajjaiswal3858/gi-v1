// One-off: self-hosts the third-party fonts and icon libraries the pages reference from CDNs,
// so the replica loads fast and works offline. Output goes to public/assets/{fonts,vendor}.
// Run:  node scripts/vendor.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function get(url, as = 'text') {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return as === 'text' ? await r.text() : Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

// Every family/weight any page asks Google Fonts for, in one stylesheet.
const GOOGLE =
  'https://fonts.googleapis.com/css2?' +
  [
    'family=Open+Sans:ital,wght@0,300..800;1,300..800',
    'family=Space+Grotesk:wght@300..700',
    'family=Playfair+Display:ital,wght@0,400..700;1,400..700',
    'family=Barlow:wght@400;600;700',
    'family=Newsreader:ital,wght@1,400..700',
    'family=Inter:wght@400..900',
    'family=Space+Mono:wght@400;700',
  ].join('&') +
  '&display=swap';

async function fonts() {
  const dir = path.join(root, 'public', 'assets', 'fonts');
  await mkdir(dir, { recursive: true });
  const css = await get(GOOGLE);
  // keep the latin + latin-ext subsets only
  const blocks = css.split(/(?=\/\* [a-z-]+ \*\/)/).filter((b) => /^\/\* latin(-ext)? \*\//.test(b));
  let out = '';
  const seen = new Map();
  for (let b of blocks) {
    const m = b.match(/url\((https:[^)]+\.woff2)\)/);
    if (!m) continue;
    if (!seen.has(m[1])) {
      const fam = b.match(/font-family: '([^']+)'/)[1].replace(/\s+/g, '');
      const style = b.match(/font-style: (\w+)/)[1];
      const sub = b.match(/^\/\* ([a-z-]+) \*\//)[1];
      const wght = b.match(/font-weight: ([\d ]+)/)[1].trim().replace(' ', '-');
      let name = `${fam}-${style}-${sub}.woff2`;
      if ([...seen.values()].includes(name)) name = `${fam}-${style}-${wght}-${sub}.woff2`;
      seen.set(m[1], name);
      await writeFile(path.join(dir, name), await get(m[1], 'buffer'));
    }
    out += b.replace(m[1], '/assets/fonts/' + seen.get(m[1]));
  }
  await writeFile(path.join(dir, 'fonts.css'), out);
  console.log(`fonts: ${seen.size} files`);
}

async function tabler() {
  const base = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.7.0/dist/';
  const dir = path.join(root, 'public', 'assets', 'vendor', 'tabler');
  await mkdir(path.join(dir, 'fonts'), { recursive: true });
  let css = await get(base + 'tabler-icons.min.css');
  // woff2 only; every current browser supports it
  css = css.replace(/src:url\([^;]+;/, 'src:url("./fonts/tabler-icons.woff2") format("woff2");');
  await writeFile(path.join(dir, 'tabler-icons.min.css'), css);
  await writeFile(path.join(dir, 'fonts', 'tabler-icons.woff2'), await get(base + 'fonts/tabler-icons.woff2', 'buffer'));
  console.log('tabler: ok');
}

async function lucide() {
  const dir = path.join(root, 'public', 'assets', 'vendor');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'lucide.min.js'), await get('https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js', 'buffer'));
  console.log('lucide: ok');
}

await fonts();
await tabler();
await lucide();

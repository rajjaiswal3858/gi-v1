// Assembles src/layout + src/pages into a static site in dist/.
// Each page source starts with:  <!--page {json meta} -->  <!--head--> ... <!--/head-->  content  <!--tail--> ...
import { readFile, writeFile, mkdir, readdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recolorCss, recolorHtml, recolorSvg } from './funk-recolor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const out = path.join(root, 'dist');
const pub = path.join(root, 'public');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function read(p) {
  return readFile(p, 'utf8');
}

function parsePage(raw, file) {
  const m = raw.match(/^<!--page (\{.*?\}) -->\n/);
  if (!m) throw new Error(`Missing page meta in ${file}`);
  const meta = JSON.parse(m[1]);
  let rest = raw.slice(m[0].length);
  let head = '';
  const h = rest.match(/^<!--head-->\n([\s\S]*?)<!--\/head-->\n/);
  if (h) {
    head = h[1];
    rest = rest.slice(h[0].length);
  }
  let tail = '';
  const t = rest.lastIndexOf('<!--tail-->');
  if (t !== -1) {
    tail = rest.slice(t + '<!--tail-->'.length);
    rest = rest.slice(0, t);
  }
  return { meta, head, content: rest, tail };
}

function render(layout, page) {
  const { meta, head, content, tail } = page;
  return `<!doctype html>
<html lang="en-US">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
${meta.description ? `<meta name="description" content="${esc(meta.description)}">\n` : ''}<link rel="icon" href="/wp-content/uploads/2021/04/favicon-hw-ai-150x150.png" sizes="32x32">
<link rel="icon" href="/wp-content/uploads/2021/04/favicon-hw-ai-300x300.png" sizes="192x192">
<link rel="apple-touch-icon" href="/wp-content/uploads/2021/04/favicon-hw-ai-300x300.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${layout.head}${head}<link rel="stylesheet" href="/assets/css/site.css">
<link rel="stylesheet" href="/assets/css/funk.css">
<script src="/wp-includes/js/jquery/jquery.min.js"></script>
<script src="/assets/js/wp-shim.js"></script>
<script src="/assets/js/hsforms-shim.js"></script>
</head>
<body class="${esc(meta.bodyClass)}">
<a class="skip-link screen-reader-text" href="#content">Skip to content</a>
${layout.header}
${content}
${layout.footer}
${tail}
<script src="/assets/js/site.js" defer></script>
<script src="/assets/js/funk.js" defer></script>
</body>
</html>
`;
}

// ---- post-processing shared by every page ---------------------------------------------------
// 1. third-party fonts / icon libraries are self-hosted (see scripts/vendor.mjs)
// 2. absolute links to the reference domain become local links whenever the target is mirrored;
//    anything not mirrored (individual blog posts, tag archives...) keeps pointing at the live site.
function localize(html, hasLocal) {
  html = html
    .replace(/https:\/\/fonts\.googleapis\.com\/css2?\?[^"'\s)<>]+/g, '/assets/fonts/fonts.css')
    .replace(/<link[^>]+rel=["']?(?:preconnect|dns-prefetch)["']?[^>]*>\s*/g, '')
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@tabler\/icons-webfont@[\d.]+\/dist\/tabler-icons\.min\.css/g, '/assets/vendor/tabler/tabler-icons.min.css')
    .replace(/https:\/\/unpkg\.com\/lucide@[\d.]+\/dist\/umd\/lucide\.min\.js/g, '/assets/vendor/lucide.min.js');
  const swap = (full, p) => {
    p = p || '/';
    const clean = p.split(/[?#]/)[0];
    return hasLocal(clean) ? p : full;
  };
  const BS = String.fromCharCode(92);
  html = html.replace(/https?:\/\/(?:www\.)?hatchworks\.com(\/[^"'\s<>)&\\]*)?(?=["'\s<>)&\\]|$)/g, swap);
  // JSON-escaped form used inside data-settings / inline config:  https:\/\/hatchworks.com\/path\/
  html = html.replace(/https?:\\\/\\\/(?:www\.)?hatchworks\.com((?:\\\/[^"'\s<>)&\\]*)*)/g, (full, p) => {
    const plain = (p || '').split(BS + '/').join('/') || '/';
    return hasLocal(plain.split(/[?#]/)[0]) ? p || BS + '/' : full;
  });
  // Blog search: there is no WordPress search template here, so "See all results" lands on the
  // blog listing, which reads ?s= itself (site.js). The widget's own config documents this option.
  html = html.replace("resultsUrl: '/',", "resultsUrl: '/resources/blog/',").replace("resultsParams: 'post_type=post',", "resultsParams: '',");
  return html;
}

// The Funk visual identity: remap colour literals in every stylesheet and SVG copied to dist/
// (public/ itself stays untouched). funk.css is the theme's own file and is skipped.
async function recolorTree(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { await recolorTree(p); continue; }
    if (e.name === 'funk.css') continue;
    if (e.name.endsWith('.css')) await writeFile(p, recolorCss(await read(p)));
    else if (e.name.endsWith('.svg')) await writeFile(p, recolorSvg(await read(p)));
  }
}

async function build() {
  const t0 = Date.now();
  if (existsSync(out)) await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(pub, out, { recursive: true });
  await recolorTree(out);

  const layout = {
    head: await read(path.join(src, 'layout', 'head.html')),
    header: await read(path.join(src, 'layout', 'header.html')),
    footer: await read(path.join(src, 'layout', 'footer.html')),
  };

  const files = (await readdir(path.join(src, 'pages'))).filter((f) => f.endsWith('.html'));
  const pages = [];
  for (const f of files) pages.push(parsePage(await read(path.join(src, 'pages', f)), f));
  const routes = new Set(pages.map((p) => p.meta.route));
  const hasLocal = (p) => {
    if (routes.has(p) || routes.has(p + '/')) return true;
    if (p.endsWith('/') || !path.extname(p)) return false;
    try { return existsSync(path.join(pub, decodeURIComponent(p))); } catch { return false; }
  };
  for (const page of pages) {
    // mark the current nav item
    const html = localize(render(layout, page), hasLocal).replace(
      new RegExp(`(<a[^>]*class="[^"]*\\bhw-(?:link|trigger|mlink)\\b[^"]*")([^>]*href="${page.meta.route.replace(/[/.*+?^${}()|[\]\\]/g, '\\$&')}")`, 'g'),
      '$1 aria-current="page"$2',
    );
    const dir = page.meta.route === '/' ? out : path.join(out, ...page.meta.route.split('/').filter(Boolean));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), recolorHtml(html));
  }

  // "Load More" fragments get the same link localisation as full pages
  const moreDir = path.join(out, 'assets', 'data', 'loadmore');
  if (existsSync(moreDir)) {
    for (const f of (await readdir(moreDir)).filter((n) => n.endsWith('.html'))) {
      const file = path.join(moreDir, f);
      await writeFile(file, recolorHtml(localize(await read(file), hasLocal)));
    }
  }

  // 404 page reuses the layout
  const notFound = {
    meta: { route: '/404/', title: 'Page not found | HatchWorks AI', description: '', bodyClass: 'error404 hello-elementor-default elementor-default elementor-kit-15997' },
    head: '',
    content: await read(path.join(src, 'partials', '404.html')),
    tail: '',
  };
  await writeFile(path.join(out, '404.html'), recolorHtml(localize(render(layout, notFound), hasLocal)));

  console.log(`Built ${files.length} pages + 404 into dist/ in ${Date.now() - t0}ms`);
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});

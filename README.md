# HatchWorks AI — static front-end replica

A front-end-only replica of https://hatchworks.com/ for local study. It is not affiliated with
HatchWorks; all text, images and branding belong to their owners. Don't deploy it publicly.

## Run it

```
npm run dev        # build into dist/ and serve at http://localhost:3001
npm run build      # build only
npm run serve      # serve an existing dist/ (PORT=5000 npm run serve to change the port)
```

Node 20+ is the only requirement; there are no dependencies to install.

## How it is put together

| Path | What it is |
| --- | --- |
| `src/layout/` | Shared `<head>` styles, header (announcement bar, mega menu, mobile drawer) and footer |
| `src/pages/*.html` | One file per page: page meta, page-specific `<head>`, content, page scripts |
| `src/partials/404.html` | Not-found page content |
| `public/` | Everything served as-is: mirrored CSS, images, video, fonts, data snapshots |
| `public/assets/js/site.js` | Shared runtime: entrance animations, Load More, YouTube embeds, blog filters, anchor scrolling |
| `public/assets/js/hsforms-shim.js` | Renders the HubSpot forms from local definitions, validates, shows the thank-you state. Sends nothing |
| `public/assets/js/wp-shim.js` | Answers the pages' WordPress REST calls from local JSON (blog search, case-study grid) |
| `public/assets/css/site.css` | Styles for the pieces above and the 404 page |
| `scripts/build.mjs` | Assembles layout + pages into `dist/`, rewrites links to local pages, self-hosts fonts |
| `scripts/serve.mjs` | Tiny static server with clean URLs and a 404 page |

File names in `src/pages` map to routes with `__` as the path separator:
`case-studies__ics.html` is served at `/case-studies/ics/`.

### "Funk" visual identity

The site is restyled by a theme layer that changes only colour, type, backgrounds, decoration and
motion. Markup, content, section order, navigation and behaviour are untouched.

| Path | What it does |
| --- | --- |
| `scripts/funk-recolor.mjs` | Build step: remaps every colour literal (CSS files, `<style>`, `style=""`, inline scripts, SVG paint, Elementor `data-settings`) from the teal/slate palette to electric blue, purple and lavender-pink, with punchier coral-orange. Runs on `dist/` only; `public/` stays as mirrored |
| `public/assets/css/funk.css` | Gradients, Space Grotesk display type, gradient buttons, card glow, floating 3D shapes, scroll reveals, header/footer accents, reduced-motion fallbacks |
| `public/assets/js/funk.js` | Finds sections, cards and buttons at runtime (also inside the pages' open shadow roots) and adds: animated blob backgrounds + floating shapes with scroll/pointer parallax, scroll-triggered reveals, magnetic buttons, card tilt + spotlight, gradient accent words, larger display headings, scroll progress bar |

To switch the theme off, remove the two `funk` lines and the `recolor*` calls in `scripts/build.mjs`.
Everything honours `prefers-reduced-motion`.

### Refreshing mirrored data (optional, needs network)

```
node scripts/vendor.mjs          # fonts + icon libraries -> public/assets/{fonts,vendor}
node scripts/fetch-data.mjs      # blog index, categories, case studies -> public/assets/data/wp
node scripts/fetch-loadmore.mjs  # extra "Load More" pages -> public/assets/data/loadmore
```

These are throttled and resumable; rerun one if it is interrupted.

## Scope and known differences from the live site

- **65 pages are mirrored**: every destination in the header, mega menus and footer (services,
  industries, partners, company pages), 19 case studies, the listing pages, three news articles
  and the legal pages.
- **Individual blog posts, podcast episodes, event pages and tag/author archives are not mirrored**
  (400+ pages). Links to them still point at the live site, so nothing is a dead link.
- **Forms do not submit anywhere.** They validate and show the success message only.
- **Blog filters** run in the browser over a snapshot of the post index. The date-range filter uses
  the browser's native date picker instead of the original jQuery UI calendar.
- **Blog search** "See all results" opens the blog listing filtered by the query, because there is
  no WordPress search-results template to mirror.
- Analytics, chat, reCAPTCHA and other third-party trackers are intentionally left out.
- A handful of images are missing on the live site itself (they return 404 there); those are hidden
  rather than shown as broken images.
- YouTube and Spotify embeds load from their own services and need a network connection.

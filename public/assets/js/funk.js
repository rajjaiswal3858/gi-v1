/* FUNK — motion & interaction layer (see /assets/css/funk.css).
   Purely decorative: it adds classes, CSS variables and aria-hidden decoration layers.
   It never moves, removes or rewrites existing content. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(sel)); };
  // open shadow roots (several pages render their content inside one) get the same treatment
  var shadowRoots = [];
  function collectShadows(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll('*'), function (el) {
      if (el.shadowRoot && shadowRoots.indexOf(el.shadowRoot) === -1) {
        shadowRoots.push(el.shadowRoot);
        collectShadows(el.shadowRoot);
      }
    });
  }
  function scopes() { return [doc].concat(shadowRoots); }
  var $$all = function (sel) { var out = []; scopes().forEach(function (s) { out = out.concat($$(sel, s)); }); return out; };
  var parentOf = function (el) { return el.parentElement || (el.parentNode && el.parentNode.host) || null; };
  function themeShadows() {
    collectShadows(doc);
    shadowRoots.forEach(function (sr) {
      if (sr.querySelector('link[data-fx]')) return;
      var l = doc.createElement('link');
      l.rel = 'stylesheet'; l.href = '/assets/css/funk.css'; l.setAttribute('data-fx', '');
      sr.insertBefore(l, sr.firstChild);
    });
  }
  var guard = function (fn) { try { fn(); } catch (e) { if (window.console) console.warn('[funk]', e); } };

  root.classList.add('fx-js');

  var HEADER = '[data-elementor-type="header"], .hw-bar, .elementor-location-header, #hw-ann, .hw-ann';
  var inChrome = function (el) { return !!el.closest(HEADER); };

  function rgb(str) {
    var m = /rgba?\(([^)]+)\)/.exec(str || '');
    if (!m) return null;
    var p = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function sat(c) {
    var mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  }
  function lum(c) { return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255; }
  var isAccent = function (c) { return c && c.a > 0.5 && sat(c) > 0.35 && lum(c) > 0.18; };

  /* ---------- 1. gradient accents in headings + eyebrows ---------- */
  function initText() {
    $$all('h1, h2, h3, .elementor-heading-title').forEach(function (h) {
      if (inChrome(h) || h.closest('.fx-grad-text')) return;
      // accent words (spans/strong/em coloured differently from the heading)
      $$('span, strong, em, b, mark', h).forEach(function (s) {
        if (!s.textContent.trim() || s.querySelector('img, svg')) return;
        var cs = getComputedStyle(s);
        if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') return;
        var sc = rgb(cs.color), hcol = rgb(getComputedStyle(h).color);
        // accent-coloured or deliberately dimmed words become the gradient words
        if (isAccent(sc) || (sc && hcol && Math.abs(lum(sc) - lum(hcol)) > 0.18 && s.textContent.trim().length > 2)) s.classList.add('fx-grad-text');
      });
      // whole heading when the heading itself is accent-coloured
      var hc = getComputedStyle(h);
      if (isAccent(rgb(hc.color)) && hc.backgroundClip !== 'text' && !h.querySelector('img, svg')) h.classList.add('fx-grad-text');
    });
    // eyebrow labels: small, spaced-out, uppercase, accent coloured
    $$all('.elementor-heading-title, .elementor-widget-text-editor p, .elementor-widget-text-editor, span, p').forEach(function (el) {
      if (el.children.length > 2 || inChrome(el) || el.closest('.fx-eyebrow, .fx-grad-text, a, button, label')) return;
      var t = el.textContent.trim();
      if (!t || t.length > 60) return;
      var cs = getComputedStyle(el);
      if (cs.textTransform !== 'uppercase' || parseFloat(cs.letterSpacing) < 1 || parseFloat(cs.fontSize) > 17) return;
      if (isAccent(rgb(cs.color))) el.classList.add('fx-eyebrow');
    });
  }

  /* ---------- 2. oversized display type (desktop only, scaled from the original sizes) ---------- */
  function initType() {
    var big = $$all('h1, h2').filter(function (h) { return !inChrome(h) && !h.closest('footer, [data-elementor-type="footer"], form'); });
    var apply = function () {
      var w = window.innerWidth;
      var k = w >= 1280 ? 1.12 : w >= 1025 ? 1.08 : w >= 768 ? 1.04 : 1;
      big.forEach(function (h) {
        // remember the heading's own inline font-size (many pages set one) and always restore it
        if (h.__fxFs === undefined) h.__fxFs = [h.style.getPropertyValue('font-size'), h.style.getPropertyPriority('font-size')];
        var restore = function () {
          if (h.__fxFs[0]) h.style.setProperty('font-size', h.__fxFs[0], h.__fxFs[1]);
          else h.style.removeProperty('font-size');
        };
        restore();
        if (k === 1 || !h.offsetHeight) return;
        var fs = parseFloat(getComputedStyle(h).fontSize);
        if (fs < 26) return;
        var h0 = h.offsetHeight;
        h.style.setProperty('font-size', (fs * k).toFixed(1) + 'px', 'important');
        // only keep the bigger size when it doesn't add a line or overflow its box
        if (h.offsetHeight > h0 * k * 1.06 || h.scrollWidth > h.clientWidth + 1) restore();
      });
    };
    apply();
    var t;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(apply, 150); });
  }

  /* ---------- 3. buttons: gradient fills + magnetic pull ---------- */
  var BTN = '.elementor-button, .hs-button, input[type="submit"], button[type="submit"], .hw-btn, a.hw404-btn';
  // custom-HTML pages use their own button classes: anything link/button-shaped with a
  // saturated fill or a visible border, a short label and pill/box padding counts as a button
  function buttonLike(el) {
    if (el.matches(BTN)) return true;
    var t = el.textContent.trim();
    if (!t || t.length > 40 || el.querySelector('img:not([src$=".svg"]), h1, h2, h3, h4, p')) return false;
    var r = el.getBoundingClientRect();
    if (r.height < 30 || r.height > 76 || r.width < 60 || r.width > 420) return false;
    var cs = getComputedStyle(el);
    if (cs.display.indexOf('inline') === -1 && cs.display.indexOf('flex') === -1) return false;
    if (parseFloat(cs.paddingLeft) < 10) return false;
    var bg = rgb(cs.backgroundColor);
    var bd = rgb(cs.borderTopColor);
    return (bg && bg.a > 0.5 && sat(bg) > 0.3) || (parseFloat(cs.borderTopWidth) > 0 && bd && bd.a > 0.15 && parseFloat(cs.borderTopLeftRadius) > 2);
  }
  function initButtons() {
    $$all(BTN + ', a, button').forEach(function (b) {
      if (b.classList.contains('fx-btn-fill') || b.classList.contains('fx-btn-line') || b.classList.contains('fx-magnetic')) return;
      if (!b.classList.contains('hw-btn') && (inChrome(b) && !b.matches(BTN))) return;
      if (!buttonLike(b)) return;
      if (!b.classList.contains('hw-btn')) {
        var cs = getComputedStyle(b);
        var bg = rgb(cs.backgroundColor);
        var border = rgb(cs.borderTopColor);
        // form submits are the primary action of their form: always the gradient fill
        if ((bg && bg.a > 0.5 && sat(bg) > 0.3) || b.matches('input[type="submit"], button[type="submit"], .hs-button')) b.classList.add('fx-btn-fill');
        else if (parseFloat(cs.borderTopWidth) > 0 && border && border.a > 0.1) b.classList.add('fx-btn-line');
      }
      if (finePointer && !reduce && !/magnet/.test(b.className)) magnet(b); // some buttons already have their own pull
    });
  }
  function magnet(el) {
    el.classList.add('fx-magnetic');
    var raf = 0;
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      var x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      var y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        el.classList.add('fx-mag-on');
        el.style.transform = 'translate3d(' + (x * 8).toFixed(1) + 'px,' + (y * 6).toFixed(1) + 'px,0) scale(1.04)';
      });
    });
    el.addEventListener('pointerleave', function () {
      cancelAnimationFrame(raf);
      el.classList.remove('fx-mag-on');
      el.style.transform = '';
    });
  }

  /* ---------- 4. cards: tilt, spotlight, gradient edge ---------- */
  function looksLikeCard(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 160 || r.height < 120 || r.width > 820 || r.height > 900) return false;
    var cs = getComputedStyle(el);
    var bg = rgb(cs.backgroundColor);
    var hasBorder = parseFloat(cs.borderTopWidth) > 0 && rgb(cs.borderTopColor) && rgb(cs.borderTopColor).a > 0.05;
    var hasBg = bg && bg.a > 0.04;
    var rounded = parseFloat(cs.borderTopLeftRadius) > 2;
    return (hasBorder || hasBg) && (rounded || hasBorder);
  }
  function initCards() {
    var main = doc.querySelector('[data-elementor-type="wp-page"], [data-elementor-type="single-page"], [data-elementor-type="single-post"], [data-elementor-type="archive"], #content, main') || doc.body;
    var cand = $$('div, article, li, a, aside', main);
    shadowRoots.forEach(function (sr) { cand = cand.concat($$('div, article, li, a, aside', sr)); });
    var cards = [];
    cand.forEach(function (el) {
      if (el.classList.contains('fx-card') || el.closest('.fx-deco') || inChrome(el)) return;
      if (el.closest('.swiper, .slick-slider, [class*="marquee"], [class*="tilt"], form, .hs-form, footer, [data-elementor-type="footer"]')) return;
      if (!el.textContent.trim()) return;
      if (/tilt/.test(el.className)) return;
      for (var i = 0; i < cards.length; i++) if (cards[i].contains(el)) return; // outermost card wins
      if (looksLikeCard(el)) cards.push(el);
    });
    // a "card" whose siblings aren't cards is usually a panel or a section box: keep only grouped ones
    cards = cards.filter(function (c) {
      var p = parentOf(c);
      if (!p) return false;
      return cards.some(function (o) { return o !== c && parentOf(o) === p; }) || /card|tile|item|post|box/i.test(c.className);
    });
    cards.forEach(function (c) {
      var cs = getComputedStyle(c);
      if (cs.position === 'static') c.style.position = 'relative';
      if (getComputedStyle(c, '::after').content === 'none') c.classList.add('fx-card');
      else return;
      if (cs.backgroundImage === 'none') c.classList.add('fx-spotlit');
      if (!finePointer) return;
      var raf = 0;
      c.addEventListener('pointerenter', function () { c.classList.add('fx-hot'); });
      c.addEventListener('pointermove', function (e) {
        var r = c.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          c.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
          c.style.setProperty('--my', (py * 100).toFixed(1) + '%');
          if (!reduce) c.style.transform = 'perspective(900px) rotateX(' + ((0.5 - py) * 7).toFixed(2) + 'deg) rotateY(' + ((px - 0.5) * 9).toFixed(2) + 'deg) translateY(-6px)';
        });
      });
      c.addEventListener('pointerleave', function () {
        cancelAnimationFrame(raf);
        c.classList.remove('fx-hot');
        c.style.transform = '';
      });
    });
  }

  /* ---------- 5. animated backgrounds + floating 3D shapes per section ---------- */
  var PALETTES = [
    ['rgba(139,61,255,.85)', 'rgba(255,61,154,.6)', 'rgba(47,123,255,.7)'],
    ['rgba(47,123,255,.8)', 'rgba(139,61,255,.7)', 'rgba(255,138,61,.5)'],
    ['rgba(255,61,154,.65)', 'rgba(255,107,107,.5)', 'rgba(139,61,255,.75)'],
    ['rgba(106,31,209,.85)', 'rgba(47,123,255,.6)', 'rgba(255,61,154,.55)'],
  ];
  var SHAPES = ['orb', 'ring', 'cube', 'pill', 'spark', 'squig', 'dots'];
  function shapeHTML(kind, i) {
    if (kind === 'cube') return '<fx-el>' + '<fx-el></fx-el>'.repeat(6) + '</fx-el>';
    if (kind === 'squig') {
      return '<fx-el><svg viewBox="0 0 120 40" fill="none"><defs><linearGradient id="fxsg' + i + '" x1="0" x2="1"><stop offset="0" stop-color="#4d6bff"/><stop offset=".5" stop-color="#ff3d9a"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs><path d="M4 20c10-18 22-18 28 0s18 18 28 0 18-18 28 0 18 18 28 0" stroke="url(#fxsg' + i + ')" stroke-width="7" stroke-linecap="round"/></svg></fx-el>';
    }
    return '<fx-el></fx-el>';
  }
  var SIZE = { orb: [70, 150], ring: [110, 200], cube: [56, 90], pill: [34, 54], spark: [26, 46], squig: [110, 170], dots: [150, 230] };
  function rand(seed) { var x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); }

  // Visual sections = full-width bands. Wrappers that only hold several bands are descended into,
  // so it works for classic Elementor sections and for the custom-HTML pages alike.
  function findSections() {
    var vw = doc.documentElement.clientWidth;
    var roots = $$('[data-elementor-type="wp-page"], [data-elementor-type="single-page"], [data-elementor-type="single-post"], [data-elementor-type="archive"], .hw404');
    if (!roots.length) roots = $$('main, #content');
    var res = [];
    var full = function (c) {
      if (c.classList.contains('fx-deco') || /^(SCRIPT|STYLE|TEMPLATE|LINK)$/.test(c.tagName)) return false;
      var cs = getComputedStyle(c);
      if (cs.position === 'fixed' || cs.position === 'absolute' || cs.display === 'none') return false;
      return c.getBoundingClientRect().width >= vw * 0.94 && c.offsetHeight > 120;
    };
    function walk(el, depth) {
      var kids = Array.prototype.filter.call((el.shadowRoot || el).children, full);
      if (depth < 12 && kids.length >= 2) { kids.forEach(function (k) { walk(k, depth + 1); }); return; }
      if (depth < 12 && kids.length === 1 && kids[0].offsetHeight > el.offsetHeight * 0.8) { walk(kids[0], depth + 1); return; }
      if (el.offsetHeight > 160 && !inChrome(el)) res.push(el);
    }
    roots = roots.filter(function (r) { return !roots.some(function (o) { return o !== r && o.contains(r); }); });
    roots.forEach(function (r) { walk(r, 0); });
    return res.filter(function (s) { return getComputedStyle(s).position !== 'sticky'; });
  }

  var decoHosts = [];
  function initDeco() {
    var sections = findSections();
    var mobile = window.innerWidth < 768;
    sections.forEach(function (sec, si) {
      var cs = getComputedStyle(sec);
      // effective background: first opaque ancestor colour (the page canvas is white)
      var bg = null;
      for (var p = sec; p && p.nodeType === 1; p = parentOf(p)) {
        var c = rgb(getComputedStyle(p).backgroundColor);
        if (c && c.a > 0.5) { bg = c; break; }
      }
      var light = bg ? lum(bg) > 0.7 : cs.backgroundImage === 'none' && !sec.querySelector(':scope > video, :scope > canvas, :scope > [class*="mesh"], :scope > [class*="bg"]');
      if (cs.position === 'static') sec.classList.add('fx-host-pos');
      sec.classList.add('fx-host');
      if (si > 0 && sec.getBoundingClientRect().top > 200) sec.classList.add('fx-seam');
      var deco = doc.createElement('fx-el');
      deco.className = 'fx-deco' + (light ? ' fx-light' : '');
      deco.setAttribute('aria-hidden', 'true');
      var pal = PALETTES[si % PALETTES.length];
      var html = '';
      var H = sec.offsetHeight;
      var blobs = H > 900 ? 3 : 2;
      for (var b = 0; b < blobs; b++) {
        var s = Math.round(380 + rand(si * 7 + b) * 360);
        var left = (b % 2 ? 60 : -12) + rand(si + b * 3) * 30;
        var top = (b / blobs) * 80 + rand(si * 3 + b) * 20 - 10;
        html += '<fx-el class="fx-blob" style="--s:' + s + 'px;--c1:' + pal[b % 3] + ';left:' + left.toFixed(1) + '%;top:' + top.toFixed(1) + '%;--d:' + (16 + b * 6) + 's;--dx:' + (b % 2 ? -80 : 90) + 'px;--dy:' + (b % 2 ? 60 : -50) + 'px;--o:' + (light ? 0.28 : 0.62) + '"></fx-el>';
      }
      // floating shapes in the side gutters so they never sit under body copy
      var count = mobile ? 1 : H > 1100 ? 3 : 2;
      for (var k = 0; k < count; k++) {
        var kind = SHAPES[(si * 3 + k * 2) % SHAPES.length];
        var rng = SIZE[kind];
        var w = Math.round(rng[0] + rand(si * 11 + k) * (rng[1] - rng[0]));
        var h = kind === 'pill' ? Math.round(w * 2.6) : kind === 'squig' ? Math.round(w / 3) : w;
        var side = (si + k) % 2 === 0 ? 'right' : 'left';
        var edge = -w * 0.18 + rand(si * 5 + k) * 24;
        var y = 8 + ((k + 0.5) / count) * 74 + (rand(si * 13 + k) - 0.5) * 12;
        html += '<fx-el class="fx-shape fx-' + kind + (k > 0 ? ' fx-desk' : '') + '" data-depth="' + (0.25 + rand(si + k * 7) * 0.6).toFixed(2) + '" style="' + side + ':' + edge.toFixed(0) + 'px;top:' + y.toFixed(1) + '%;width:' + w + 'px;height:' + h + 'px;--w:' + w + 'px;--d:' + (8 + rand(si * 2 + k) * 8).toFixed(1) + 's">' + shapeHTML(kind, si * 10 + k) + '</fx-el>';
      }
      deco.innerHTML = html;
      sec.appendChild(deco);
      decoHosts.push({ sec: sec, shapes: $$('.fx-shape', deco), visible: false });
    });
  }

  /* scroll parallax + pointer drift for the shapes, progress bar */
  function initMotion() {
    var bar = doc.createElement('div');
    bar.className = 'fx-progress';
    bar.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(bar);
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { decoHosts.forEach(function (d) { if (d.sec === e.target) d.visible = e.isIntersecting; }); });
      }, { rootMargin: '100px 0px' });
      decoHosts.forEach(function (d) { io.observe(d.sec); });
    } else decoHosts.forEach(function (d) { d.visible = true; });

    var mx = 0, my = 0, ticking = false;
    function frame() {
      ticking = false;
      var max = root.scrollHeight - window.innerHeight;
      bar.style.setProperty('--fx-p', max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : 0);
      if (reduce) return;
      var vh = window.innerHeight;
      decoHosts.forEach(function (d) {
        if (!d.visible) return;
        var r = d.sec.getBoundingClientRect();
        var prog = (r.top + r.height / 2 - vh / 2) / vh; // 0 when centred
        d.shapes.forEach(function (s) {
          var depth = +s.getAttribute('data-depth');
          s.style.setProperty('--sy', (prog * -120 * depth).toFixed(1) + 'px');
          s.style.setProperty('--px', (mx * 26 * depth).toFixed(1) + 'px');
          s.style.setProperty('--py', (my * 18 * depth).toFixed(1) + 'px');
        });
      });
    }
    var req = function () { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    if (finePointer) window.addEventListener('pointermove', function (e) {
      mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; req();
    }, { passive: true });
    frame();
  }

  /* ---------- 6. scroll-triggered reveals ---------- */
  // inside a horizontal scroller / carousel / clipped track, an element may never cross the
  // viewport vertically-and-horizontally, so it must never be hidden waiting for that
  function inSideways(el) {
    var vw = window.innerWidth;
    var r = el.getBoundingClientRect();
    if (r.left >= vw - 1 || r.right <= 1) return true;
    for (var p = parentOf(el); p && p !== doc.body; p = parentOf(p)) {
      var ox = getComputedStyle(p).overflowX;
      if (ox !== 'visible' && p.scrollWidth > p.clientWidth + 2) return true;
      if (/carousel|slider|swiper|track|marquee|scroller|timeline|rail/i.test(p.className)) return true;
    }
    return false;
  }
  function initReveal() {
    if (reduce || !('IntersectionObserver' in window)) return;
    // reveal whole child blocks of each section; skip anything Elementor already animates,
    // anything sticky (transforms would break pinning) and the header/footer chrome.
    var targets = [];
    $$all('.fx-host').forEach(function (sec) {
      var inner = sec.querySelector(':scope > .e-con-inner') || sec;
      Array.prototype.forEach.call(inner.children, function (el) {
        if (el.classList.contains('fx-deco')) return;
        targets.push(el);
      });
    });
    targets = targets.filter(function (el) {
      // leave alone anything that already has its own entrance animation
      if (el.matches('.elementor-invisible, .animated, [class*="reveal"], [data-reveal], [data-animate]') || el.querySelector('.elementor-invisible, [class*="reveal"], [data-reveal], [data-animate], [style*="opacity: 0"], [style*="opacity:0"]')) return false;
      if (el.closest('.hw404') || inSideways(el)) return false;
      if (getComputedStyle(el).position === 'sticky' || getComputedStyle(el).position === 'fixed') return false;
      var stick = el.querySelectorAll('*');
      if (stick.length > 600) return false;
      for (var i = 0; i < stick.length; i++) {
        var p = getComputedStyle(stick[i]).position;
        if (p === 'sticky' || p === 'fixed') return false;
      }
      return el.offsetHeight > 0;
    });
    var vh = window.innerHeight;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        e.target.classList.add('fx-in');
        // release the transform afterwards so nothing keeps a containing block / layer
        setTimeout(function () { e.target.classList.remove('fx-reveal', 'fx-reveal-l', 'fx-reveal-r', 'fx-in'); e.target.style.removeProperty('--fx-delay'); }, 1600);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
    targets.forEach(function (el, i) {
      var r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) return; // already on screen: leave alone
      var sibs = (el.parentElement || el.parentNode).children;
      var sib = sibs.length;
      var idx = Array.prototype.indexOf.call(sibs, el);
      el.classList.add('fx-reveal');
      if (r.width < window.innerWidth * 0.6 && sib > 1) el.classList.add(idx % 2 ? 'fx-reveal-r' : 'fx-reveal-l');
      el.style.setProperty('--fx-delay', Math.min(idx, 4) * 90 + 'ms');
      io.observe(el);
    });
    // safety net: anything that is above the bottom of the viewport (e.g. skipped by a very fast
    // scroll or a jump link) is shown, whether or not the observer fired
    var sweep = 0;
    var check = function () {
      sweep = 0;
      var lim = window.innerHeight;
      $$all('.fx-reveal:not(.fx-in)').forEach(function (el) {
        if (el.getBoundingClientRect().top < lim) { io.unobserve(el); el.classList.add('fx-in'); setTimeout(function () { el.classList.remove('fx-reveal', 'fx-reveal-l', 'fx-reveal-r', 'fx-in'); el.style.removeProperty('--fx-delay'); }, 1600); }
      });
    };
    window.addEventListener('scroll', function () { if (!sweep) sweep = setTimeout(check, 250); }, { passive: true });
    // grid items (cards, loop items) stagger inside their row
    $$all('.fx-card').forEach(function (c) {
      if (c.closest('.fx-reveal') || c.closest('[class*="reveal"]') || c.querySelector('[class*="reveal"]')) return;
      if (inSideways(c)) return;
      var r = c.getBoundingClientRect();
      if (r.top < vh * 0.92) return;
      var idx = Array.prototype.indexOf.call((c.parentElement || c.parentNode).children, c);
      c.classList.add('fx-reveal');
      c.style.setProperty('--fx-delay', (idx % 4) * 110 + 'ms');
      io.observe(c);
    });
  }

  function start() {
    guard(themeShadows);
    guard(initText);
    guard(initType);
    guard(initButtons);
    guard(initCards);
    guard(initDeco);
    guard(initMotion);
    guard(initReveal);
    // Load More / filtered results arrive later: give new buttons and cards the same treatment
    if ('MutationObserver' in window) {
      var pending = 0;
      new MutationObserver(function (muts) {
        // only content that can carry buttons / cards (Load More, filtered results) is worth a rescan
        if (!muts.some(function (m) { return Array.prototype.some.call(m.addedNodes, function (n) { return n.nodeType === 1 && n.tagName !== 'FX-EL' && n.querySelector && (n.matches('article, a, button') || n.querySelector('article, a, button')); }); })) return;
        if (pending) return;
        pending = setTimeout(function () {
          pending = 0;
          $$all(BTN).forEach(function (b) {
            if (b.classList.contains('fx-btn-fill') || b.classList.contains('fx-btn-line') || b.classList.contains('hw-btn')) return;
            var cs = getComputedStyle(b), bg = rgb(cs.backgroundColor);
            if ((bg && bg.a > 0.5 && sat(bg) > 0.3) || b.matches('input[type="submit"], button[type="submit"], .hs-button')) b.classList.add('fx-btn-fill');
            if (finePointer && !reduce && !b.classList.contains('fx-magnetic')) magnet(b);
          });
          guard(initCards);
        }, 200);
      }).observe(doc.body, { childList: true, subtree: true });
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})();

/* Shared client runtime for the static replica.
   The page markup is Elementor output; this file supplies the small part of the Elementor /
   plugin frontend behaviour those pages rely on, without the original plugin bundles:
     - entrance animations            - "Load More" listing buttons
     - YouTube video widgets          - blog filters, sorting, pagination and ?s= search
     - in-page anchor scrolling       - broken-image fallbacks
   Page-specific widgets ship their own inline scripts and are left untouched. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function settings(el) {
    try { return JSON.parse(el.getAttribute('data-settings') || '{}'); } catch (e) { return {}; }
  }
  function guard(name, fn) {
    try { fn(); } catch (e) { if (window.console) console.warn('[site] ' + name + ' skipped:', e); }
  }
  function pageSlug() {
    var p = window.location.pathname.replace(/^\/+|\/+$/g, '');
    return p ? p.split('/').join('__') : 'index';
  }
  function headerOffset() {
    var bar = $('#hwnav .hw-bar') || $('header.elementor-location-header');
    if (!bar) return 0;
    var r = bar.getBoundingClientRect();
    return Math.max(0, r.bottom);
  }

  /* ---------- entrance animations (Elementor: .elementor-invisible + data-settings.animation) ---------- */
  function initEntrance() {
    var els = $$('.elementor-invisible');
    if (!els.length) return;
    var show = function (el) {
      var s = settings(el), name = s.animation || s._animation || 'fadeIn', delay = +(s.animation_delay || s._animation_delay || 0);
      setTimeout(function () {
        el.classList.remove('elementor-invisible');
        if (!reduceMotion && name !== 'none') el.classList.add('animated', name);
      }, delay);
    };
    if (!('IntersectionObserver' in window)) { els.forEach(show); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); show(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- video widget (YouTube) ---------- */
  function youtubeId(url) {
    var m = String(url || '').match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/);
    return m ? m[1] : null;
  }
  function initVideos() {
    $$('.elementor-widget-video').forEach(function (widget) {
      var s = settings(widget);
      if (s.video_type !== 'youtube') return;
      var id = youtubeId(s.youtube_url), slot = $('.elementor-video', widget);
      if (!id || !slot || slot.tagName === 'IFRAME') return;
      var mount = function () {
        var params = ['rel=0', 'playsinline=1', 'controls=' + (s.controls === 'yes' ? 1 : 0)];
        if (s.autoplay === 'yes') params.push('autoplay=1');
        if (s.mute === 'yes') params.push('mute=1');
        if (s.loop === 'yes') params.push('loop=1', 'playlist=' + id);
        var frame = document.createElement('iframe');
        frame.className = 'elementor-video';
        frame.src = 'https://www.youtube.com/embed/' + id + '?' + params.join('&');
        frame.title = 'YouTube video player';
        frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        frame.allowFullscreen = true;
        frame.loading = 'lazy';
        frame.setAttribute('frameborder', '0');
        slot.parentNode.replaceChild(frame, slot);
      };
      if (!('IntersectionObserver' in window)) { mount(); return; }
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); mount(); }
      }, { rootMargin: '400px 0px' });
      io.observe(widget);
    });
  }

  /* ---------- "Load More" (Elementor posts / loop-grid, load_more_on_click) ---------- */
  function initLoadMore() {
    $$('.e-load-more-anchor').forEach(function (anchor, index, all) {
      var widget = anchor.closest('.elementor-widget');
      if (!widget) return;
      var container = $('.elementor-posts-container, .elementor-loop-container', widget);
      var button = $('.elementor-button-wrapper .elementor-button, .e-load-more-button, .elementor-button', widget);
      if (!container || !button) return;
      var page = +anchor.getAttribute('data-page') || 1, max = +anchor.getAttribute('data-max-page') || 1;
      var busy = false;
      var finish = function () {
        widget.classList.add('e-load-more-pagination-end');
        var wrap = button.closest('.elementor-button-wrapper') || button;
        wrap.style.display = 'none';
      };
      if (page >= max) { finish(); return; }
      button.setAttribute('role', 'button');
      button.addEventListener('click', function (e) {
        e.preventDefault();
        if (busy || page >= max) return;
        busy = true;
        widget.classList.add('e-load-more-pagination-loading');
        var name = pageSlug() + (all.length > 1 ? '-' + index : '') + '-' + (page + 1) + '.html';
        fetch('/assets/data/loadmore/' + name).then(function (r) {
          if (!r.ok) throw new Error('no more pages');
          return r.text();
        }).then(function (html) {
          var tpl = document.createElement('template');
          tpl.innerHTML = html;
          var added = Array.prototype.slice.call(tpl.content.children).filter(function (n) { return n.tagName !== 'STYLE'; });
          added.forEach(function (n) { n.classList.add('hw-loaded-in'); });
          container.appendChild(tpl.content);
          page += 1;
          anchor.setAttribute('data-page', String(page));
          if (page >= max) finish();
        }).catch(function () { finish(); }).then(function () {
          busy = false;
          widget.classList.remove('e-load-more-pagination-loading');
        });
      });
    });
  }

  /* ---------- in-page anchors: smooth scroll that clears the fixed header ---------- */
  function initAnchors() {
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href*="#"]');
      if (!a) return;
      var url;
      try { url = new URL(a.getAttribute('href'), window.location.href); } catch (err) { return; }
      if (url.pathname !== window.location.pathname || url.search !== window.location.search || url.hash.length < 2) return;
      var target;
      try { target = document.getElementById(decodeURIComponent(url.hash.slice(1))); } catch (err) { return; }
      if (!target) return;
      e.preventDefault();
      var top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset() - 12;
      window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
      if (history.pushState) history.pushState(null, '', url.hash);
    });
    // arriving with a hash: re-align once the layout has settled under the fixed header
    if (window.location.hash.length > 1) {
      window.addEventListener('load', function () {
        var target;
        try { target = document.getElementById(decodeURIComponent(window.location.hash.slice(1))); } catch (err) { return; }
        if (target) window.scrollTo(0, Math.max(0, target.getBoundingClientRect().top + window.pageYOffset - headerOffset() - 12));
      });
    }
  }

  /* ---------- images the reference site itself no longer serves: hide instead of a broken icon ---------- */
  function initImageFallback() {
    var hide = function (img) { img.classList.add('hw-img-missing'); };
    $$('img').forEach(function (img) {
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) hide(img);
      else img.addEventListener('error', function () { hide(img); }, { once: true });
    });
  }

  /* ---------- blog: JetSmartFilters stand-in (category, tags, date range, sorting, pagination, ?s=) ---------- */
  function initBlogFilters() {
    var grid = $('.elementor-widget-loop-grid .elementor-loop-container');
    var pager = $('.jet-smart-filters-pagination');
    if (!grid || !pager || !window.hwData) return;
    var template = $('.e-loop-item', grid);
    if (!template) return;
    template = template.cloneNode(true);
    var widget = grid.closest('.elementor-widget');
    var perPage = $$('.e-loop-item', grid).length || 15;
    var controls = {};
    try { controls = JSON.parse(pager.getAttribute('data-controls') || '{}'); } catch (e) { /* defaults */ }

    var sortSel = $('.jet-sorting-select');
    var catSel = $('.jet-select__control');
    var tagBoxes = $$('.jet-checkboxes-list__input');
    var from = $('.jet-date-range__from'), to = $('.jet-date-range__to'), dateBtn = $('.jet-date-range__submit');
    var params = new URLSearchParams(window.location.search);
    var state = { page: 1, search: (params.get('s') || '').trim(), cat: '', tags: [], from: '', to: '', orderby: 'date', order: 'DESC' };
    var all = null, dirty = false;

    // the grid lists a subset of all posts (its own query); blog-order.json records which
    function loadPosts() {
      return Promise.all([window.hwData('posts'), window.hwData('blog-order')]).then(function (res) {
        var order = res[1] || [];
        if (!order.length) return res[0];
        var listed = {};
        order.forEach(function (id) { listed[id] = true; });
        return res[0].filter(function (p) { return listed[p.id]; });
      });
    }
    function decode(html) { var t = document.createElement('textarea'); t.innerHTML = html; return t.value; }
    function fmtDate(iso) {
      var d = new Date(iso);
      return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    function parseDate(v, endOfDay) {
      if (!v) return null;
      var m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/) || null, d;
      if (m) d = new Date(+m[1], +m[2] - 1, +m[3]);
      else { m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return null; d = new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2]); }
      if (endOfDay) d.setHours(23, 59, 59, 999);
      return isNaN(d.getTime()) ? null : d;
    }

    function card(p) {
      var el = template.cloneNode(true);
      el.className = el.className.replace(/\be-loop-item-\d+\b/, 'e-loop-item-' + p.id).replace(/\bpost-\d+\b/, 'post-' + p.id)
        .replace(/\b(?:category|tag)-[\w-]+\s*/g, '').trim() + (p.classes ? ' ' + p.classes : '');
      $$('a', el).forEach(function (a) { a.setAttribute('href', a.closest('[itemprop="author"]') ? (p.authorLink || '#') : p.link); });
      var img = $('img', el);
      if (img) {
        if (p.img) {
          img.removeAttribute('srcset'); img.removeAttribute('sizes'); img.removeAttribute('fetchpriority');
          img.setAttribute('loading', 'lazy');
          img.src = p.img; img.alt = p.alt || decode(p.title);
          if (p.iw && p.ih) { img.width = p.iw; img.height = p.ih; }
          img.className = img.className.replace(/wp-image-\d+/, '');
        } else {
          var holder = img.closest('.elementor-widget');
          if (holder) holder.parentNode.removeChild(holder);
        }
      }
      var title = $('.elementor-widget-theme-post-title .elementor-heading-title a', el) || $('.elementor-heading-title', el);
      if (title) title.innerHTML = p.title;
      var time = $('time', el);
      if (time) time.textContent = fmtDate(p.date);
      var author = $('.elementor-post-info__item--type-author', el);
      if (author) author.textContent = ' ' + p.author + ' ';
      return el;
    }

    function matches(p) {
      if (state.cat && p.cats.indexOf(+state.cat) === -1) return false;
      if (state.tags.length && !state.tags.some(function (t) { return (p.tags || []).indexOf(t) !== -1; })) return false;
      var d = new Date(p.date), f = parseDate(state.from), t = parseDate(state.to, true);
      if (f && d < f) return false;
      if (t && d > t) return false;
      if (state.search) {
        var hay = (decode(p.title) + ' ' + (p.excerpt || '')).toLowerCase();
        if (!state.search.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; })) return false;
      }
      return true;
    }

    function pagerItem(label, value, cls) {
      return '<div class="jet-filters-pagination__item' + (cls ? ' ' + cls : '') + '" data-value="' + value + '"><div class="jet-filters-pagination__link" role="button" tabindex="0">' + label + '</div></div>';
    }
    function renderPager(pages) {
      if (pages < 2) { pager.innerHTML = ''; return; }
      var mid = +controls.pages_mid_size || 0, end = +controls.pages_end_size || 0, cur = state.page, html = '';
      if (controls.nav_enabled !== false && !(controls.hide_inactive_nav && cur === 1)) html += pagerItem(controls.prev || 'Prev', 'prev', 'prev-next prev');
      var dotted = false;
      for (var i = 1; i <= pages; i++) {
        var visible = !mid || i <= end || i > pages - end || Math.abs(i - cur) <= mid;
        if (visible) { html += pagerItem(i, i, i === cur ? 'jet-filters-pagination__current' : ''); dotted = false; }
        else if (!dotted) { html += '<div class="jet-filters-pagination__item"><div class="jet-filters-pagination__dots">&hellip;</div></div>'; dotted = true; }
      }
      if (controls.nav_enabled !== false && !(controls.hide_inactive_nav && cur === pages)) html += pagerItem(controls.next || 'Next', 'next', 'prev-next next');
      pager.innerHTML = '<div class="jet-filters-pagination">' + html + '</div>';
    }

    function render(scroll) {
      var list = all.filter(matches);
      var dir = state.order === 'ASC' ? 1 : -1;
      if (state.orderby === 'title') list.sort(function (a, b) { return dir * decode(a.title).localeCompare(decode(b.title)); });
      else list.sort(function (a, b) { return dir * (a.date < b.date ? -1 : a.date > b.date ? 1 : 0); });
      var pages = Math.max(1, Math.ceil(list.length / perPage));
      state.page = Math.min(Math.max(1, state.page), pages);
      // the server-rendered first page stays as-is until a filter, sort or page change touches it
      if (dirty) {
        var keep = $$('style', grid), frag = document.createDocumentFragment();
        keep.forEach(function (s) { frag.appendChild(s); });
        list.slice((state.page - 1) * perPage, state.page * perPage).forEach(function (p) { frag.appendChild(card(p)); });
        grid.innerHTML = '';
        grid.appendChild(frag);
        var empty = $('.e-loop-nothing-found-message', widget);
        if (!list.length && !empty) {
          empty = document.createElement('div');
          empty.className = 'e-loop-nothing-found-message';
          empty.textContent = 'It seems we can’t find what you’re looking for.';
          grid.parentNode.insertBefore(empty, grid.nextSibling);
        } else if (list.length && empty) empty.parentNode.removeChild(empty);
      }
      renderPager(pages);
      if (scroll) {
        var top = widget.getBoundingClientRect().top + window.pageYOffset - headerOffset() - 24 - (+controls.provider_top_offset || 0);
        window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }

    function apply(scroll) {
      dirty = true;
      widget.classList.add('hw-filter-loading');
      loadPosts().then(function (posts) {
        all = posts;
        render(scroll);
        widget.classList.remove('hw-filter-loading');
      });
    }

    if (sortSel) sortSel.addEventListener('change', function () {
      var v = {};
      try { v = JSON.parse(sortSel.value || '{}'); } catch (e) { /* default order */ }
      state.orderby = v.orderby || 'date'; state.order = v.order || 'DESC'; state.page = 1; apply(false);
    });
    if (catSel) catSel.addEventListener('change', function () { state.cat = catSel.value; state.page = 1; apply(false); });
    tagBoxes.forEach(function (box) {
      box.addEventListener('change', function () {
        state.tags = tagBoxes.filter(function (b) { return b.checked; }).map(function (b) { return +b.value; });
        state.page = 1; apply(false);
      });
    });
    // the original uses a jQuery UI datepicker; the native date picker stands in for it
    [from, to].forEach(function (input) {
      if (!input) return;
      input.setAttribute('placeholder', 'mm/dd/yyyy');
      input.addEventListener('focus', function () { input.type = 'date'; if (input.showPicker) { try { input.showPicker(); } catch (e) { /* needs a user gesture */ } } });
      input.addEventListener('blur', function () { if (!input.value) input.type = 'text'; });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (dateBtn) dateBtn.click(); } });
    });
    if (dateBtn) dateBtn.addEventListener('click', function () {
      state.from = from ? from.value : ''; state.to = to ? to.value : ''; state.page = 1; apply(false);
    });
    var go = function (e) {
      var item = e.target.closest('.jet-filters-pagination__item[data-value]');
      if (!item || item.classList.contains('jet-filters-pagination__current')) return;
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      var v = item.getAttribute('data-value');
      state.page = v === 'prev' ? state.page - 1 : v === 'next' ? state.page + 1 : +v;
      apply(true);
    };
    pager.addEventListener('click', go);
    pager.addEventListener('keydown', go);

    // first paint: pager for the untouched server-rendered page, or a search handed over via ?s=
    loadPosts().then(function (posts) {
      all = posts;
      if (!all.length) return;
      if (state.search) {
        var box = $('#hwhInput');
        if (box) { box.value = state.search; box.dispatchEvent(new Event('change')); }
        dirty = true;
      }
      render(false);
    });
  }

  function boot() {
    guard('entrance', initEntrance);
    guard('videos', initVideos);
    guard('load-more', initLoadMore);
    guard('anchors', initAnchors);
    guard('images', initImageFallback);
    guard('blog-filters', initBlogFilters);
    document.documentElement.classList.add('hw-ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

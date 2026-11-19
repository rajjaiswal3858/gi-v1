/* Local stand-in for the WordPress REST API.
   A few pages call /wp-json/wp/v2/... at runtime (blog search, the case-study grid). There is no
   backend here, so fetch() calls to those endpoints are answered from JSON snapshots in
   /assets/data/wp/ (see scripts/fetch-data.mjs). Every other request passes straight through. */
(function () {
  if (!window.fetch || window.__hwWpShim) return;
  window.__hwWpShim = true;

  var realFetch = window.fetch.bind(window);
  var cache = {};
  function data(name) {
    if (!cache[name]) {
      cache[name] = realFetch('/assets/data/wp/' + name + '.json').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    }
    return cache[name];
  }
  window.hwData = data; // shared with site.js (blog filters)

  function json(body, total, totalPages) {
    var headers = { 'Content-Type': 'application/json; charset=UTF-8' };
    if (total != null) { headers['X-WP-Total'] = String(total); headers['X-WP-TotalPages'] = String(totalPages); }
    return new Response(JSON.stringify(body), { status: 200, headers: headers });
  }
  function ids(v) { return (v || '').split(',').map(Number).filter(Boolean); }
  function plain(html) { var t = document.createElement('textarea'); t.innerHTML = String(html || '').replace(/<[^>]+>/g, ''); return t.value.toLowerCase(); }

  // slim index record -> the WP REST post shape callers read
  function toWpPost(p) {
    var media = p.img ? [{ source_url: p.img, alt_text: p.alt || '', media_details: { width: p.iw, height: p.ih, sizes: { thumbnail: { source_url: p.img }, medium: { source_url: p.img }, medium_large: { source_url: p.img } } } }] : [];
    return { id: p.id, link: p.link, date: p.date, title: { rendered: p.title }, excerpt: { rendered: p.excerpt || '' }, categories: p.cats, tags: p.tags || [], _embedded: { 'wp:featuredmedia': media, author: [{ name: p.author }] } };
  }

  function posts(q) {
    return data('posts').then(function (all) {
      var list = all.slice();
      var exclude = ids(q.get('categories_exclude')), include = ids(q.get('categories')), tags = ids(q.get('tags'));
      if (exclude.length) list = list.filter(function (p) { return !p.cats.some(function (c) { return exclude.indexOf(c) !== -1; }); });
      if (include.length) list = list.filter(function (p) { return p.cats.some(function (c) { return include.indexOf(c) !== -1; }); });
      if (tags.length) list = list.filter(function (p) { return (p.tags || []).some(function (c) { return tags.indexOf(c) !== -1; }); });
      var search = (q.get('search') || '').trim().toLowerCase();
      if (search) {
        var terms = search.split(/\s+/);
        list = list.map(function (p) {
          var title = plain(p.title), body = (p.excerpt || '').toLowerCase(), score = 0;
          for (var i = 0; i < terms.length; i++) {
            if (title.indexOf(terms[i]) !== -1) score += 10;
            else if (body.indexOf(terms[i]) !== -1) score += 1;
            else return null;
          }
          if (title.indexOf(search) !== -1) score += 20;
          return { p: p, score: score };
        }).filter(Boolean).sort(function (a, b) { return b.score - a.score || (a.p.date < b.p.date ? 1 : -1); }).map(function (x) { return x.p; });
      } else if (q.get('orderby') === 'title') {
        list.sort(function (a, b) { return plain(a.title).localeCompare(plain(b.title)); });
      }
      if ((q.get('order') || '').toLowerCase() === 'asc' && !search) list.reverse();
      var per = Math.max(1, Math.min(100, +q.get('per_page') || 10)), page = Math.max(1, +q.get('page') || 1);
      return json(list.slice((page - 1) * per, page * per).map(toWpPost), list.length, Math.ceil(list.length / per));
    });
  }

  function categories(q) {
    return data('categories').then(function (all) {
      var slugs = (q.get('slug') || '').split(',').filter(Boolean);
      var list = slugs.length ? all.filter(function (c) { return slugs.indexOf(c.slug) !== -1; }) : all;
      return json(list, list.length, 1);
    });
  }

  function handle(url) {
    var route = url.pathname.replace(/^\/wp-json\/wp\/v2\/?/, '').replace(/\/$/, '');
    var q = url.searchParams;
    if (route === 'categories') return categories(q);
    if (route === 'posts') return posts(q);
    if (route === 'pages') return data('case-studies').then(function (list) { return json(list, list.length, 1); });
    return Promise.resolve(json([], 0, 0));
  }

  window.fetch = function (input, init) {
    try {
      var raw = typeof input === 'string' ? input : input && input.url;
      if (raw) {
        var url = new URL(raw, window.location.href);
        if (url.origin === window.location.origin && url.pathname.indexOf('/wp-json/wp/v2') === 0) return handle(url);
      }
    } catch (e) { /* fall through to the network */ }
    return realFetch(input, init);
  };
})();

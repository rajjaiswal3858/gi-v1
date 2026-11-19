/* Local stand-in for HubSpot's forms embed (js.hsforms.net/forms/embed/v2.js).
   Renders the same markup/classes HubSpot produces from mirrored form definitions in
   /assets/data/hsforms/{formId}.json, validates client-side, and shows the inline
   thank-you message. Nothing is sent anywhere. */
(function () {
  if (window.hbspt && window.hbspt.forms && window.hbspt.forms.__local) return;

  var STYLE_ID = 'hs-shim-base';
  function baseStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    // Mirrors the layout rules of HubSpot's default form stylesheet (same selectors and
    // specificity), which the pages' own form CSS was written on top of. Inserted first in
    // <head> so page styles keep winning ties.
    s.textContent =
      '.hs-form fieldset{border:0;padding:0;margin:0;max-width:none;min-width:0}' +
      '.hs-form fieldset:after{content:"";display:table;clear:both}' +
      '.hs-form fieldset.form-columns-1 .hs-form-field{width:100%}' +
      '.hs-form fieldset.form-columns-2 .hs-form-field{width:50%;float:left}' +
      '.hs-form fieldset.form-columns-3 .hs-form-field{width:32.7%;float:left}' +
      '.hs-form fieldset .input{margin-right:8px}' +
      '.hs-form .hs-form-field{margin-bottom:0}' +
      '.hs-form .hs-form-field>label{display:inline-block}' +
      '.hs-form.hs-flat .input{margin-right:0}' +
      '.hs-form .hs-form-required{color:#f2545b}' +
      '.hs-form .hs-input{box-sizing:border-box;width:100%;max-width:100%}' +
      '.hs-form textarea.hs-input{resize:vertical}' +
      '.hs-form .hs-error-msgs{list-style:none;margin:4px 0 0;padding:0}' +
      '.hs-form .hs-error-msgs label{color:#f2545b;font-size:13px;font-weight:400;text-transform:none;letter-spacing:0}' +
      '.hs-form .hs_recaptcha{margin-bottom:18px;min-height:42px}' +
      '.hs-form .hs-submit .actions{margin:0;padding:0}' +
      '.hs-form .hs-button{cursor:pointer}' +
      '.hs-form .hs-hidden-field{display:none!important}' +
      '@media (max-width:400px){.hs-form fieldset.form-columns-2 .hs-form-field,.hs-form fieldset.form-columns-3 .hs-form-field{width:100%;float:none}}';
    document.head.insertBefore(s, document.head.firstChild);
  }

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function buildField(f, formId, uid) {
    var id = f.name + '-' + formId + '_' + uid;
    var wrap = el('div', {
      class: 'hs_' + f.name + ' hs-' + f.name + ' hs-fieldtype-' + f.fieldType + ' field hs-form-field' + (f.hidden ? ' hs-hidden-field' : ''),
    });
    // HubSpot always emits the label with a span, even when the label text is empty
    var label = el('label', { id: 'label-' + id, class: '', for: id },
      '<span>' + escapeHtml(f.label) + '</span>' + (f.label && f.required ? '<span class="hs-form-required">*</span>' : ''));
    wrap.appendChild(label);
    if (f.description) wrap.appendChild(el('legend', { class: 'hs-field-desc', style: 'display:block' }, escapeHtml(f.description)));
    var holder = el('div', { class: 'input' });
    var input;
    var isEmail = f.name === 'email';
    // placeholder-only fields carry the required marker in the placeholder itself
    if (!f.label && f.required && f.placeholder && !/\*$/.test(f.placeholder)) f = Object.assign({}, f, { placeholder: f.placeholder + '*' });
    if (f.fieldType === 'textarea') {
      input = el('textarea', { id: id, class: 'hs-input hs-fieldtype-textarea', name: f.name, placeholder: f.placeholder || '' });
    } else if (f.fieldType === 'select') {
      input = el('select', { id: id, class: 'hs-input', name: f.name });
      input.appendChild(el('option', { value: '', disabled: '', selected: '' }, escapeHtml(f.placeholder || 'Please Select')));
      (f.options || []).forEach(function (o) {
        input.appendChild(el('option', { value: o.value }, escapeHtml(o.label)));
      });
    } else {
      input = el('input', {
        id: id, class: 'hs-input', name: f.name, type: f.hidden ? 'hidden' : isEmail ? 'email' : 'text',
        placeholder: f.placeholder || '', value: f.defaultValue || '',
        autocomplete: isEmail ? 'email' : f.name === 'firstname' ? 'given-name' : f.name === 'lastname' ? 'family-name' : f.name === 'company' ? 'organization' : null,
        inputmode: isEmail ? 'email' : null,
      });
    }
    if (f.required) { input.setAttribute('required', ''); input.setAttribute('aria-required', 'true'); }
    holder.appendChild(input);
    wrap.appendChild(holder);
    return { wrap: wrap, input: input, def: f };
  }

  function validateField(item) {
    var f = item.def, v = (item.input.value || '').trim(), msg = '';
    if (f.hidden) return true;
    if (f.required && !v) msg = 'Please complete this required field.';
    else if (f.name === 'email' && v && !EMAIL_RE.test(v)) msg = 'Email must be formatted correctly.';
    var old = item.wrap.querySelector('.hs-error-msgs');
    if (old) old.remove();
    item.input.classList.toggle('invalid', !!msg);
    item.input.classList.toggle('error', !!msg);
    if (msg) {
      item.input.setAttribute('aria-invalid', 'true');
      item.wrap.appendChild(el('ul', { class: 'no-list hs-error-msgs inputs-list', role: 'alert' },
        '<li><label class="hs-error-msg hs-main-font-element">' + msg + '</label></li>'));
    } else item.input.removeAttribute('aria-invalid');
    return !msg;
  }

  var counter = 0;
  function render(container, def, opts) {
    var uid = ++counter;
    var formId = def.guid || opts.formId;
    var form = el('form', {
      id: 'hsForm_' + formId + '_' + uid, novalidate: '', 'accept-charset': 'UTF-8',
      class: (opts.cssClass || def.cssClass || 'hs-form stacked') + ' hs-form-private hsForm_' + formId + ' hs-form-' + formId,
      'data-form-id': formId, 'data-portal-id': opts.portalId || '',
    });
    var items = [];
    // The reference site serves two structures. Forms with visible labels: one <fieldset> per row
    // plus a (visually empty) reCAPTCHA row before the button. Placeholder-only forms: fields sit
    // directly in the <form>, with no reCAPTCHA row.
    var flat = (def.groups || []).every(function (g) { return (g.fields || []).every(function (f) { return !f.label; }); });
    if (flat) form.classList.add('hs-flat');
    (def.groups || []).forEach(function (g) {
      var fields = g.fields || [];
      if (g.richText) form.appendChild(el('div', { class: 'hs-richtext hs-main-font-element' }, g.richText));
      if (!fields.length) return;
      var row = flat ? form : el('fieldset', { class: 'form-columns-' + fields.length });
      fields.forEach(function (f) {
        var item = buildField(f, formId, uid);
        items.push(item);
        row.appendChild(item.wrap);
      });
      if (flat) return;
      if (fields.every(function (f) { return f.hidden; })) row.style.display = 'none';
      form.appendChild(row);
    });
    if (def.legal) form.appendChild(el('div', { class: 'legal-consent-container' }, '<div class="hs-richtext">' + def.legal + '</div>'));
    if (!flat) form.appendChild(el('div', { class: 'hs_recaptcha hs-recaptcha field hs-form-field' }, '<div class="input"></div>'));
    var submitWrap = el('div', { class: 'hs_submit hs-submit' },
      '<div class="hs-field-desc" style="display:none"></div><div class="actions"></div>');
    var btn = el('input', { type: 'submit', class: 'hs-button primary large ' + (opts.submitButtonClass || ''), value: opts.submitText || def.submitText || 'Submit' });
    submitWrap.querySelector('.actions').appendChild(btn);
    form.appendChild(submitWrap);

    items.forEach(function (item) {
      item.input.addEventListener('blur', function () { validateField(item); });
      item.input.addEventListener('input', function () {
        if (item.input.classList.contains('invalid')) validateField(item);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true, first = null;
      items.forEach(function (item) {
        if (!validateField(item)) { ok = false; first = first || item.input; }
      });
      var roll = form.querySelector('.hs_error_rollup');
      if (roll) roll.remove();
      if (!ok) {
        submitWrap.parentNode.insertBefore(el('div', { class: 'hs_error_rollup' },
          '<ul class="no-list hs-error-msgs inputs-list" role="alert"><li><label class="hs-main-font-element">Please complete all required fields.</label></li></ul>'), submitWrap);
        if (first) first.focus();
        return;
      }
      var data = items.map(function (i) { return { name: i.def.name, value: i.input.value }; });
      try { if (typeof opts.onFormSubmit === 'function') opts.onFormSubmit(form); } catch (err) { console.error(err); }
      window.postMessage({ type: 'hsFormCallback', eventName: 'onFormSubmit', id: formId, data: data }, '*');
      btn.disabled = true;
      setTimeout(function () {
        if (opts.redirectUrl) { window.location.href = opts.redirectUrl; return; }
        var done = el('div', { class: 'submitted-message hs-main-font-element', role: 'status', tabindex: '-1' },
          opts.inlineMessage || def.inlineMessage || '<p>Thanks for submitting the form.</p>');
        container.innerHTML = '';
        container.appendChild(done);
        try { if (typeof opts.onFormSubmitted === 'function') opts.onFormSubmitted(form, { submissionValues: data }); } catch (err) { console.error(err); }
        window.postMessage({ type: 'hsFormCallback', eventName: 'onFormSubmitted', id: formId, data: { submissionValues: data } }, '*');
      }, 350);
    });

    container.innerHTML = '';
    container.appendChild(form);
    try { if (typeof opts.onFormReady === 'function') opts.onFormReady(form); } catch (err) { console.error(err); }
    window.postMessage({ type: 'hsFormCallback', eventName: 'onFormReady', id: formId }, '*');
  }

  var cache = {};
  function load(formId) {
    if (!cache[formId]) {
      cache[formId] = fetch('/assets/data/hsforms/' + formId + '.json').then(function (r) {
        if (!r.ok) throw new Error('Form definition not found: ' + formId);
        return r.json();
      });
    }
    return cache[formId];
  }

  function create(opts) {
    opts = opts || {};
    baseStyles();
    var container = el('div', { class: 'hbspt-form', id: 'hbspt-form-' + Date.now() + '-' + Math.floor(Math.random() * 1e6) });
    var script = document.currentScript;
    function place() {
      if (opts.target) {
        var target = document.querySelector(opts.target);
        if (!target) return false; // target markup comes later in the document
        if (target.classList.contains('hbspt-form')) container = target; // WordPress plugin markup
        else target.appendChild(container);
      } else if (script && script.parentNode) script.parentNode.insertBefore(container, script.nextSibling);
      else document.body.appendChild(container);
      return true;
    }
    var placed = place();
    var ready = placed ? Promise.resolve() : new Promise(function (res) {
      document.addEventListener('DOMContentLoaded', function () { placed = place(); res(); });
    });
    Promise.all([load(opts.formId), ready]).then(function (r) { if (placed) render(container, r[0], opts); }).catch(function (err) {
      console.warn('[hsforms-shim]', err.message);
    });
    return { id: opts.formId };
  }

  window.hbspt = window.hbspt || {};
  window.hbspt.forms = { create: create, __local: true };

  // The HubSpot WordPress plugin queues its embeds on window.hsFormsOnReady and the real loader
  // drains that queue; do the same, for callbacks queued before and after this script runs.
  var queued = Array.isArray(window.hsFormsOnReady) ? window.hsFormsOnReady.slice() : [];
  var run = function (fn) { try { if (typeof fn === 'function') fn(); } catch (err) { console.error(err); } };
  window.hsFormsOnReady = { push: function () { for (var i = 0; i < arguments.length; i++) run(arguments[i]); return 0; } };
  queued.forEach(run);
})();

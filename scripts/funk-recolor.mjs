// "Funk" colour system: remaps the mirrored site's teal / slate palette onto the new
// electric-blue / purple / pink / coral / orange identity at build time.
// It only rewrites colour literals (hex + rgb/rgba) in CSS, <style>, style="", inline scripts
// and SVG paint attributes. Markup, content and structure are never touched.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
}

// The palette rules. Returns null when the colour should stay as it is.
export function remap(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 0.06 || l < 0.02 || l > 0.985) return null; // true greys, black, white
  // teal / cyan family -> purple (dark) / electric blue (mid) / lavender-pink (light)
  if (h >= 150 && h < 200 && s >= 0.18) {
    if (l >= 0.7) return hslToRgb(292, clamp(s * 0.9 + 0.25, 0.5, 1), clamp(l, 0.7, 0.95));
    if (l < 0.36) return hslToRgb(268, clamp(s, 0.6, 0.92), clamp(l + 0.05, 0.05, 0.42));
    return hslToRgb(230, 1, clamp(l + 0.2, 0.55, 0.74));
  }
  // saturated blues
  if (h >= 200 && h < 250 && s >= 0.35) {
    if (l < 0.3) return hslToRgb(262, clamp(s, 0.5, 0.85), l);
    return hslToRgb(228, 1, clamp(l + 0.05, 0.45, 0.82));
  }
  // slate / bluish neutrals -> violet-tinted neutrals
  if (h >= 180 && h < 260) {
    if (l < 0.3) return hslToRgb(260, clamp(s + 0.25, 0.3, 0.55), l);
    if (l < 0.75) return hslToRgb(255, clamp(s + 0.06, 0.08, 0.3), l);
    return hslToRgb(268, clamp(s + 0.3, 0.3, 0.7), l);
  }
  // orange -> punchier coral-orange
  if (h >= 8 && h < 40 && s >= 0.5) return hslToRgb(h - 4, 1, clamp(l + 0.03, 0.3, 0.8));
  return null;
}

const hex2 = (n) => n.toString(16).padStart(2, '0');

function remapHex(m) {
  let hex = m.slice(1);
  let a = '';
  if (hex.length === 3 || hex.length === 4) {
    if (hex.length === 4) a = hex[3] + hex[3];
    hex = hex.slice(0, 3).split('').map((c) => c + c).join('');
  } else if (hex.length === 8) {
    a = hex.slice(6);
    hex = hex.slice(0, 6);
  }
  const out = remap(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
  if (!out) return m;
  return '#' + out.map(hex2).join('') + a;
}

// hex colours: 3/4/6/8 digits, not part of an HTML entity (&#039;) and not followed by more word chars
const HEX = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const HEX_LONG = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})(?![\w-])/g;
const RGB = /rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*((?:[,/]\s*[\d.]+%?\s*)?)\)/g;

function remapRgb(m, r, g, b, rest) {
  const out = remap(+r, +g, +b);
  if (!out) return m;
  const alpha = rest.replace(/^[,/]\s*/, '').trim();
  return alpha ? `rgba(${out.join(',')},${alpha})` : `rgb(${out.join(',')})`;
}

// CSS: colours only appear in declarations, but #ids can appear in selectors, so hex is only
// replaced when it sits in a value position (after ':' ',' '(' or whitespace inside a declaration).
export function recolorCss(css) {
  return css
    .replace(/:[^;{}]*/g, (decl) => decl.replace(HEX, remapHex))
    .replace(RGB, remapRgb);
}

export function recolorScript(js) {
  return js.replace(HEX_LONG, remapHex).replace(RGB, remapRgb);
}

export function recolorHtml(html) {
  return html
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, a, css, c) => a + recolorCss(css) + c)
    .replace(/(<script\b(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, a, js, c) => a + recolorScript(js) + c)
    .replace(/(\sstyle=")([^"]*)(")/gi, (_, a, css, c) => a + recolorCss(css) + c)
    .replace(/(\sstyle=')([^']*)(')/gi, (_, a, css, c) => a + recolorCss(css) + c)
    .replace(/(\s(?:fill|stroke|stop-color|color|flood-color)=["'])(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))(["'])/gi,
      (_, a, v, c) => a + v.replace(HEX, remapHex).replace(RGB, remapRgb) + c)
    // Elementor data-settings JSON (background colours of animated containers etc.)
    .replace(/(\sdata-settings=")([^"]*)(")/gi, (_, a, v, c) => a + v.replace(HEX_LONG, remapHex) + c);
}

export function recolorSvg(svg) {
  return svg.replace(HEX_LONG, remapHex).replace(RGB, remapRgb);
}

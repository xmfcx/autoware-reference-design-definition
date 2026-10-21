import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPresentationServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

// Each variant keeps the diagram readable on its own background.
const variants = {
  transparent: { background: null, arrow: '#4c9bd0', border: '#b5d7e8', commercial: 'solid', glow: false },
  'dark-bg': { background: 'dark', arrow: '#d8f6ff', border: '#ffffffbc', commercial: 'glass', glow: true },
  'light-bg': { background: '#f4f9fc', arrow: '#3b84b5', border: '#b5d7e8', commercial: 'solid', glow: false },
};
const output = fileURLToPath(new URL('../public/assets/diagram/', import.meta.url));
await mkdir(output, { recursive: true });
const server = createPresentationServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const url = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${url}/#slide-1`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  const { svgs, width, height } = await page.evaluate(buildSvgs, variants);
  const render = await browser.newPage();
  await render.setViewport({ width, height, deviceScaleFactor: 3 });
  // Load a same-origin page first so the SVG can use the bundled fonts.
  await render.goto(`${url}/assets/FONT-LICENSE.txt`, { waitUntil: 'load' });
  for (const [name, svg] of Object.entries(svgs)) {
    const file = `${output}autoware-reference-design-diagram-${name}`;
    await writeFile(`${file}.svg`, svg);
    await render.setContent(`<!doctype html><style>@font-face{font-family:Carlito;src:url(/assets/Carlito-Regular.ttf)}@font-face{font-family:Carlito;font-weight:700;src:url(/assets/Carlito-Bold.ttf)}html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`, { waitUntil: 'load' });
    await render.evaluate(() => Promise.all([document.fonts.load('20px Carlito'), document.fonts.load('700 20px Carlito')]));
    await (await render.$('svg')).screenshot({ path: `${file}.png`, omitBackground: true });
    console.log(`Exported diagram: ${file}.svg and .png`);
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}

// Runs in the page: rebuilds the cover diagram as a standalone SVG from its layout.
function buildSvgs(variants) {
  const map = document.querySelector('#slide-1 .system-map');
  const mapRect = map.getBoundingClientRect();
  const scale = map.offsetWidth / mapRect.width;
  const pad = 24, width = map.offsetWidth + pad * 2, height = map.offsetHeight + pad * 2;
  const round = value => Math.round(value * 10) / 10;
  const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const place = rect => ({ x: (rect.left - mapRect.left) * scale + pad, y: (rect.top - mapRect.top) * scale + pad, w: rect.width * scale, h: rect.height * scale });
  const hex = color => '#' + color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value).toString(16).padStart(2, '0')).join('');
  const paint = (attribute, color, opacity = `${attribute}-opacity`) => `${attribute}="${color.slice(0, 7)}"${color.length > 7 ? ` ${opacity}="${round(parseInt(color.slice(7), 16) / 255)}"` : ''}`;
  // Resolve the icon CSS variables, because SVG editors do not support them.
  const symbols = [...map.querySelectorAll('.icon-sprite symbol')].map(symbol => symbol.outerHTML
    .replace(/var\(--icon-fill\)/g, '#a6e0f4').replace(/var\(--icon-hub\)/g, '#f7fdff').replace(/currentColor/g, '#0b679f')
    .replace(/style="fill:([^;"]+);stroke:none"/g, 'fill="$1" stroke="none"').replace(/style="fill:([^;"]+)"/g, 'fill="$1"')).join('');
  function textLines(element) {
    const lines = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode;
      if (!text.textContent.trim()) continue;
      const marker = document.createElement('span');
      marker.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      text.before(marker);
      const range = document.createRange();
      range.selectNodeContents(text);
      const baseline = place(marker.getBoundingClientRect()).y, left = place(range.getBoundingClientRect()).x;
      marker.remove();
      const style = getComputedStyle(text.parentElement);
      lines.push({ text: text.textContent, x: left, y: baseline, size: parseFloat(style.fontSize), bold: parseInt(style.fontWeight) >= 600, color: hex(style.color) });
    }
    return lines;
  }
  const nodes = [...map.querySelectorAll('.map-node')].map(node => {
    const icon = node.querySelector('.node-icon');
    return { classes: node.classList, box: place(node.getBoundingClientRect()), lines: textLines(icon ? icon.nextElementSibling : node),
      icon: icon && { id: icon.querySelector('use').getAttribute('href').slice(1), box: place(icon.getBoundingClientRect()) } };
  });
  const paths = [...map.querySelectorAll('.map-connections > path')].map(path => `<path d="${path.getAttribute('d')}"${path.classList.contains('map-optional') ? ' stroke-dasharray="6 6"' : ''}/>`).join('');
  const gradients = { input: ['#f3fefff7', '#dcf4fbe0', 125], main: ['#fafffff5', '#cceff8e6', 130], design: ['#fcffff', '#c4e7f4', 130], glass: ['#ffffff38', '#ffffff14', 130], solid: ['#3591cb', '#1c68a2', 130], tile: ['#fbffff', '#d6eff9', 160] };
  const gradient = (id, [from, to, angle]) => {
    const radians = (angle - 90) * Math.PI / 180, dx = Math.cos(radians) / 2, dy = Math.sin(radians) / 2;
    return `<linearGradient id="g-${id}" x1="${round(.5 - dx)}" y1="${round(.5 - dy)}" x2="${round(.5 + dx)}" y2="${round(.5 + dy)}"><stop offset="0" ${paint('stop-color', from, 'stop-opacity')}/><stop offset="1" ${paint('stop-color', to, 'stop-opacity')}/></linearGradient>`;
  };
  const svgs = {};
  for (const [name, variant] of Object.entries(variants)) {
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Carlito, Calibri, 'Segoe UI', sans-serif">`,
      `<title>Autoware reference design diagram</title><defs>${Object.entries(gradients).map(([id, colors]) => gradient(id, colors)).join('')}`,
      '<linearGradient id="g-background" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06396d"/><stop offset=".55" stop-color="#075999"/><stop offset="1" stop-color="#0a6eaa"/></linearGradient>',
      '<filter id="shadow" x="-20%" y="-30%" width="140%" height="180%"><feDropShadow dx="0" dy="7" stdDeviation="8" flood-color="#023d61" flood-opacity=".13"/></filter>',
      '<filter id="glow" x="-30%" y="-40%" width="160%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation="15" flood-color="#bcf7fa" flood-opacity=".33"/><feDropShadow dx="0" dy="7" stdDeviation="8" flood-color="#023d61" flood-opacity=".13"/></filter>',
      `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${variant.arrow}"/></marker>${symbols}</defs>`];
    if (variant.background === 'dark') parts.push(`<rect width="${width}" height="${height}" fill="url(#g-background)"/>`);
    else if (variant.background) parts.push(`<rect width="${width}" height="${height}" fill="${variant.background}"/>`);
    parts.push(`<g fill="none" stroke="${variant.arrow}" stroke-width="2" marker-end="url(#arrow)" transform="translate(${pad} ${pad})">${paths}</g>`);
    for (const node of nodes) {
      const commercial = node.classes.contains('map-commercial'), design = node.classes.contains('map-design'), glass = commercial && variant.commercial === 'glass';
      const fill = commercial ? variant.commercial : design ? 'design' : node.classes.contains('map-input') ? 'input' : 'main';
      const border = commercial ? (glass ? '#ffffff8c' : null) : design && variant.background === 'dark' ? '#ffffff' : variant.border;
      const strokeWidth = design ? 2 : 1, box = node.box;
      const filter = glass ? '' : design && variant.glow ? ' filter="url(#glow)"' : ' filter="url(#shadow)"';
      parts.push(`<rect x="${round(box.x + strokeWidth / 2)}" y="${round(box.y + strokeWidth / 2)}" width="${round(box.w - strokeWidth)}" height="${round(box.h - strokeWidth)}" rx="13" fill="url(#g-${fill})"${border ? ` ${paint('stroke', border)} stroke-width="${strokeWidth}"` : ''}${filter}/>`);
      if (node.icon) {
        const icon = node.icon.box, inset = commercial ? 4 : 0;
        if (commercial) parts.push(`<rect x="${round(icon.x)}" y="${round(icon.y)}" width="${round(icon.w)}" height="${round(icon.h)}" rx="10" fill="url(#g-tile)"/>`);
        parts.push(`<use href="#${node.icon.id}" xlink:href="#${node.icon.id}" x="${round(icon.x + inset)}" y="${round(icon.y + inset)}" width="${round(icon.w - inset * 2)}" height="${round(icon.h - inset * 2)}" fill="none" stroke="#0b679f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`);
      }
      for (const line of node.lines) parts.push(`<text x="${round(line.x)}" y="${round(line.y)}" font-size="${line.size}" font-weight="${line.bold ? 700 : 400}" fill="${commercial ? '#ffffff' : line.color}">${escape(line.text)}</text>`);
    }
    parts.push('</svg>');
    svgs[name] = parts.join('\n');
  }
  return { svgs, width, height };
}

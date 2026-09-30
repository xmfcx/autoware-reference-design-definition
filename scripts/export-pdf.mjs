import { fileURLToPath } from 'node:url';
import { createPresentationServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const server = createPresentationServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle0' });
  const slideCount = await page.evaluate(async () => { await document.fonts.ready; return window.prepareForExport(); });
  await page.emulateMediaType('print');

  // Composite decoration in the browser so PDF viewers do not have to interpret
  // overlapping transparent gradients, image color transforms, and soft masks.
  // Text stays separate and selectable; these images contain only decoration.
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.querySelector('.deck'), NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      if (walker.currentNode.textContent.trim() && !walker.currentNode.parentElement.closest('svg')) nodes.push(walker.currentNode);
    }
    for (const node of nodes) {
      const wrapper = document.createElement('pdf-text');
      wrapper.style.cssText = 'display:contents;visibility:hidden';
      node.replaceWith(wrapper);
      wrapper.append(node);
    }
  });
  const backgrounds = [];
  for (const slide of await page.$$('.slide')) {
    backgrounds.push(await slide.screenshot({ type: 'png', encoding: 'base64' }));
  }
  await page.evaluate(backgrounds => {
    for (const wrapper of document.querySelectorAll('pdf-text')) wrapper.replaceWith(...wrapper.childNodes);
    const style = document.createElement('style');
    style.textContent = `
      .slide::before,.slide::after { display:none!important }
      .slide *,.slide *::before,.slide *::after {
        background:none!important;
        border-color:transparent!important;
        box-shadow:none!important;
        text-shadow:none!important;
      }
      .slide svg,.slide img,.slide canvas { visibility:hidden!important }
    `;
    document.head.append(style);
    document.querySelectorAll('.slide').forEach((slide, index) => {
      slide.style.background = `url("data:image/png;base64,${backgrounds[index]}") center / 100% 100% no-repeat`;
    });
  }, backgrounds);
  const output = fileURLToPath(new URL('../public/autoware-reference-design.pdf', import.meta.url));
  await page.pdf({ path: output, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, tagged: true });
  console.log(`Exported ${slideCount} slides: ${output}`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}

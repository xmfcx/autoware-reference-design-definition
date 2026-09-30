import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPresentationServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const preview = fileURLToPath(new URL('../.preview/', import.meta.url));
await mkdir(preview, { recursive: true });
const server = createPresentationServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const url = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  async function swipe(from, to) {
    const touch = await page.touchscreen.touchStart(from[0], from[1]);
    for (let step = 1; step <= 5; step++) {
      await touch.move(from[0] + (to[0] - from[0]) * step / 5, from[1] + (to[1] - from[1]) * step / 5);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    }
    await touch.end();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  async function slideNumber() { return page.$eval('#slide-counter', element => element.textContent); }
  async function controlsHidden() {
    return page.$$eval('.toolbar,.presentation-controls', elements => elements.every(element => getComputedStyle(element).display === 'none'));
  }
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('#slide-counter').wait().then(() => page.$eval('#slide-counter', e => e.textContent)), '01 / 08');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.$eval('#slide-counter', e => e.textContent), '02 / 08');
  await page.keyboard.press('End');
  assert.equal(await page.$eval('#next-slide', e => e.disabled), true);
  await page.keyboard.press('Home');
  assert.equal(await page.$eval('#previous-slide', e => e.disabled), true);
  await page.click('#overview-toggle');
  assert.equal(await page.$eval('#slide-menu', e => e.hidden), false);
  await page.click('#slide-menu button:nth-child(5)');
  assert.equal(await page.$eval('#slide-counter', e => e.textContent), '05 / 08');
  assert.equal(await page.$eval('#slide-menu', e => e.hidden), true);
  assert.equal(await page.$$eval('#catalog-rows tr', e => e.length), 5);
  await page.select('#family-filter', 'shuttle');
  assert.equal(await page.$$eval('#catalog-rows tr', e => e.length), 3);
  await page.select('#sensor-filter', 'camera');
  assert.equal(await page.$eval('#catalog-empty', e => e.hidden), false);
  await page.evaluate(() => window.prepareForExport());
  assert.equal(await page.$$eval('#catalog-rows tr', e => e.length), 5);
  await page.click('#reset-filters');
  assert.equal(await page.$eval('#family-filter', e => e.value), 'all');
  assert.equal(await page.$$eval('#catalog-rows tr', e => e.length), 5);

  const overflow = [];
  for (let number = 1; number <= 8; number++) {
    await page.evaluate(number => { location.hash = `slide-${number}`; }, number);
    await page.waitForFunction(number => document.querySelector(`#slide-${number}`).hidden === false, {}, number);
    await page.screenshot({ path: `${preview}/desktop-${number}.png` });
    const overlaps = await page.evaluate(number => {
      const slide = document.querySelector(`#slide-${number}`);
      const footer = slide.querySelector('.slide-footer').getBoundingClientRect();
      return [...slide.querySelectorAll('.slide-content > *')].filter(element => element.getBoundingClientRect().bottom > footer.top - 3).map(element => element.className);
    }, number);
    if (overlaps.length) overflow.push({ slide: number, overlaps });
  }
  assert.deepEqual(overflow, [], 'Slide content overlaps its footer');

  await page.setViewport({ width: 3840, height: 2160, deviceScaleFactor: 1 });
  await page.click('#fullscreen-toggle');
  await page.waitForFunction(() => Boolean(document.fullscreenElement));
  await page.waitForFunction(() => document.querySelector('.deck-shell').getBoundingClientRect().width > 3000);
  const largeScreen = await page.$eval('.deck-shell', element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
  });
  assert.ok(largeScreen.width > 3000 && largeScreen.height > 1700, 'Slides should expand on a 4K screen');
  assert.ok(largeScreen.right <= 3840 && largeScreen.bottom <= 2160, 'Scaled slides should fit the screen');
  assert.ok(await controlsHidden(), 'Present should hide the toolbar and navigation');
  await page.keyboard.press('Home');
  await page.screenshot({ path: `${preview}/desktop-4k.png` });
  assert.deepEqual(await page.$$eval('.closing-line strong', elements => elements.map(element => element.textContent)), ['family', 'profile', 'stack', 'design']);
  await page.evaluate(() => document.exitFullscreen());

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.evaluate(() => localStorage.setItem('autoware-slide-layout', 'mobile'));
  await page.goto(url, { waitUntil: 'networkidle0' });
  assert.equal(await page.$('#layout-select'), null, 'The mobile layout selector should be removed');
  assert.equal(await page.$eval('.map-connections', element => getComputedStyle(element).display), 'block', 'Old mobile preferences must not change the desktop diagram');
  for (let number = 1; number <= 8; number++) {
    await page.evaluate(number => { location.hash = `slide-${number}`; }, number);
    await page.waitForFunction(number => document.querySelector(`#slide-${number}`).hidden === false, {}, number);
    const bounds = await page.$eval('.deck-shell', element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, right: rect.right };
    });
    assert.ok(Math.abs(bounds.width / bounds.height - 16 / 9) < 0.01, `Phone slide ${number} should retain desktop proportions`);
    assert.ok(bounds.right <= 390 && bounds.width > 340, `Desktop slides should fit the phone width: ${JSON.stringify(bounds)}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `Desktop layout overflows on phone slide ${number}`);
    if ([1, 5].includes(number)) await page.screenshot({ path: `${preview}/phone-desktop-${number}.png`, fullPage: true });
  }
  for (const viewport of [{ width: 844, height: 390 }, { width: 320, height: 568 }]) {
    await page.setViewport({ ...viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.waitForFunction(() => document.querySelector('.deck-shell').getBoundingClientRect().right <= innerWidth);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Controls must fit narrow and landscape screens');
    const fits = await page.$eval('.deck-shell', element => {
      const rect = element.getBoundingClientRect();
      return rect.top >= document.querySelector('.toolbar').getBoundingClientRect().bottom && rect.bottom <= document.querySelector('.presentation-controls').getBoundingClientRect().top;
    });
    assert.ok(fits, 'Desktop slides should fit between the toolbar and navigation in either orientation');
    await page.screenshot({ path: `${preview}/phone-desktop-${viewport.width}.png`, fullPage: true });
  }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.keyboard.press('Home');
  await swipe([290, 440], [100, 440]);
  assert.equal(await slideNumber(), '02 / 08', 'Swiping left should advance exactly one slide outside presentation mode');
  await swipe([100, 440], [290, 440]);
  assert.equal(await slideNumber(), '01 / 08', 'Swiping right should go back');

  await page.tap('#fullscreen-toggle');
  await page.waitForFunction(() => Boolean(document.fullscreenElement), { timeout: 5000 });
  assert.ok(await controlsHidden());
  const phoneFullscreen = await page.$eval('.deck-shell', element => element.getBoundingClientRect().width);
  assert.ok(phoneFullscreen >= 389, 'Presentation should use the full phone width');
  await page.touchscreen.tap(370, 440);
  assert.equal(await slideNumber(), '02 / 08', 'Tapping the right side should advance');
  await page.touchscreen.tap(20, 440);
  assert.equal(await slideNumber(), '01 / 08', 'Tapping the left side should go back');
  await page.touchscreen.tap(20, 440);
  assert.equal(await slideNumber(), '01 / 08', 'Navigation should stop at the first slide');
  await swipe([350, 440], [40, 440]);
  assert.equal(await slideNumber(), '02 / 08', 'A swipe must not also trigger a side tap');
  await swipe([40, 440], [350, 440]);
  assert.equal(await slideNumber(), '01 / 08');
  await swipe([190, 400], [190, 550]);
  assert.equal(await slideNumber(), '01 / 08', 'Vertical gestures must not navigate');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 280, y: 430 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.equal(await slideNumber(), '01 / 08', 'Canceled gestures must not navigate');
  await page.screenshot({ path: `${preview}/phone-present-portrait.png`, fullPage: true });
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.waitForFunction(() => document.querySelector('.deck-shell').getBoundingClientRect().height >= 389);
  assert.ok(await controlsHidden(), 'Controls should remain hidden after rotation');
  await page.screenshot({ path: `${preview}/phone-present-landscape.png`, fullPage: true });

  await page.keyboard.press('End');
  await page.touchscreen.tap(824, 195);
  assert.equal(await slideNumber(), '08 / 08', 'Navigation should stop at the final slide');
  await page.keyboard.press('Home');
  await page.keyboard.press('Space');
  assert.equal(await slideNumber(), '02 / 08', 'Keyboard navigation should work with the presentation focused');
  await page.keyboard.press('Home');
  await page.touchscreen.tap(422, 195);
  assert.equal(await page.$eval('#exit-presentation', element => element.hidden), false, 'A center tap should reveal Exit');
  await page.tap('#exit-presentation');
  await page.waitForFunction(() => !document.fullscreenElement);
  assert.equal(await controlsHidden(), false, 'Exit should restore the controls');
  assert.equal(await slideNumber(), '01 / 08', 'Exiting should not change the slide');

  // Browser restrictions must not make Present disappear or trap the user.
  const restoreFullscreen = await page.evaluateHandle(() => document.documentElement.requestFullscreen);
  await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new Error('Fullscreen unavailable')); });
  await page.tap('#fullscreen-toggle');
  assert.ok(await controlsHidden(), 'Presentation should still fill the page when native fullscreen is denied');
  assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), false);
  await page.keyboard.press('Escape');
  assert.equal(await controlsHidden(), false, 'Escape should also leave the fallback presentation');
  await page.evaluate(original => { document.documentElement.requestFullscreen = original; }, restoreFullscreen);
  await restoreFullscreen.dispose();

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.emulateMediaType('print');
  assert.equal(await page.$eval('#slide-1', element => element.getBoundingClientRect().width), 1280);
  assert.equal(await page.$eval('#presentation-hint', element => getComputedStyle(element).display), 'none');
  await page.emulateMediaType('screen');

  const pdf = await fetch(`${url}/autoware-reference-design.pdf`);
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get('content-type'), /application\/pdf/);
  assert.match(pdf.headers.get('content-disposition'), /attachment/);
  const pdfBytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
  const publishedPdfUrl = 'https://github.com/xmfcx/autoware-reference-design-definition/raw/refs/heads/data/autoware-reference-design.pdf';
  assert.equal(await page.$eval('#download-pdf', element => element.href), publishedPdfUrl);
  // The first CI run creates the data branch after these checks. Serve the local
  // export at its future published URL to test the button without an existing branch.
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url() === publishedPdfUrl) {
      request.respond({ status: 200, contentType: 'application/pdf', headers: { 'Content-Disposition': 'attachment; filename="autoware-reference-design.pdf"' }, body: pdfBytes });
    } else request.continue();
  });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: preview, eventsEnabled: true });
  const downloaded = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('PDF download did not complete')), 15000);
    cdp.on('Browser.downloadProgress', event => { if (event.state === 'completed') { clearTimeout(timeout); resolve(); } });
  });
  await page.click('#download-pdf');
  await downloaded;
  assert.deepEqual(await readFile(`${preview}/autoware-reference-design.pdf`), pdfBytes);
  assert.equal((await fetch(`${url}/docs/private-discussion.png`)).status, 404);
  assert.equal((await fetch(`${url}/docs/reference-design-evidence-report.md`)).status, 404);
  assert.deepEqual(errors, [], 'Browser errors');
  console.log('Passed: slide navigation, menu, filters, full-catalog export, desktop and 4K layouts, desktop slides on phones, fullscreen presentation, touch navigation, rotation, fullscreen fallback, print layout, PDF download, and public-only serving.');
  console.log(`Screenshots: ${preview}`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}

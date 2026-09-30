import { fileURLToPath } from 'node:url';
import { createPresentationServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const server = createPresentationServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.emulateMediaType('print');
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  const output = fileURLToPath(new URL('../public/assets/social-preview.jpg', import.meta.url));
  const slide = await page.$('#slide-1');
  const image = await slide.screenshot({ path: output, type: 'jpeg', quality: 85 });
  // WhatsApp requires preview images under 600 KB; fail publication if exceeded.
  if (image.byteLength >= 600_000) throw new Error(`Sharing image is too large for WhatsApp: ${image.byteLength} bytes`);
  console.log(`Exported sharing image: ${output} (${image.byteLength} bytes)`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}

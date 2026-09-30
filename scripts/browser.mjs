import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export async function launchBrowser() {
  const require = createRequire(import.meta.url);
  const puppeteer = require(process.env.PUPPETEER_MODULE_PATH || 'puppeteer-core');
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe')].filter(Boolean);
  let executablePath;
  for (const candidate of candidates) { try { await access(candidate, constants.X_OK); executablePath = candidate; break; } catch {} }
  if (!executablePath) throw new Error('Chrome or Chromium was not found. Set CHROME_PATH to its executable.');
  return puppeteer.launch({ executablePath, headless: true, args: ['--disable-dev-shm-usage', ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
}

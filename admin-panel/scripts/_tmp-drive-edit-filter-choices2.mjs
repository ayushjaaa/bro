import puppeteer from 'puppeteer';
import path from 'node:path';

const OUT_DIR = '/tmp/admin-panel-screenshots';

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('response', (res) => {
    if (res.status() >= 400) console.log('BAD RESPONSE:', res.status(), res.url());
  });
  page.on('requestfailed', (req) => console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText));

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('input[type="email"]', 'automation-test-admin@example.com');
  await page.type('input[type="password"]', 'TestAutomation123!');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto('http://localhost:3000/taxonomy', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Smoking'))?.click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Rolling Papers'))?.click(); });
  await new Promise((r) => setTimeout(r, 200));

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Material');
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 300));

  await page.type('input[placeholder="Add value..."]', 'Bamboo');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Add')?.click(); });
  await new Promise((r) => setTimeout(r, 5000));
  await page.screenshot({ path: path.join(OUT_DIR, 'e4-after-add-v2.png') });
  const text = await page.evaluate(() => document.body.innerText);
  console.log('page has Bamboo chip text now:', text.includes('Bamboo'));

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });

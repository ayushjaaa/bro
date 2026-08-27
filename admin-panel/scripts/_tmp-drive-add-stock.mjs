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
  await page.setViewport({ width: 1400, height: 1000 });
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('input[type="email"]', 'automation-test-admin@example.com');
  await page.type('input[type="password"]', 'TestAutomation123!');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto('http://localhost:3000/products/10836991476024/edit-flavours', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(OUT_DIR, 'as1-before.png') });

  // Click "+ Add Stock" on row 1
  await page.evaluate(() => {
    const row = document.querySelectorAll('table tbody tr')[0];
    const btn = [...row.querySelectorAll('button')].find((b) => b.textContent?.includes('Add Stock'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT_DIR, 'as2-inline-open.png') });

  await page.type('table tbody tr:first-child input[placeholder="+20"]', '20');
  await page.evaluate(() => {
    const row = document.querySelectorAll('table tbody tr')[0];
    const btn = [...row.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Add');
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(OUT_DIR, 'as3-after-add.png') });

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });

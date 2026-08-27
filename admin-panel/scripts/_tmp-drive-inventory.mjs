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

  await page.goto('http://localhost:3000/products/10836991476024/variants', { waitUntil: 'networkidle0' });

  await page.type('table tbody tr:first-child td:nth-child(1) input', 'StockTest');
  await page.type('table tbody tr:first-child td:nth-child(4) input', '9.99');
  await page.type('table tbody tr:first-child td:nth-child(6) input', '42'); // Quantity column
  await page.screenshot({ path: path.join(OUT_DIR, 'inv1-row-filled.png') });

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Create All'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 5000));
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Created 1, failed 0:', bodyText.includes('Created 1, failed 0'));

  await page.goto('http://localhost:3000/products/10836991476024', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(OUT_DIR, 'inv2-detail-with-stock.png'), fullPage: true });

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });

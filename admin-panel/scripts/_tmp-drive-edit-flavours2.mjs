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

  // Quantity is the 4th <input> among the row's cells: description(0), price(1), compare-at(2), quantity(3)
  const rowSelector = (rowIndex, inputIndex) =>
    `table tbody tr:nth-child(${rowIndex}) td:nth-child(${inputIndex}) input`;
  await page.type(rowSelector(2, 6), '25'); // Description(2) Region(3) Price(4) Compare-at(5) Quantity(6)
  await page.type(rowSelector(3, 6), '30');
  await page.screenshot({ path: path.join(OUT_DIR, 'ev5-bulk-typed.png') });

  const dirtyCountText = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Save All'));
    return btn?.textContent;
  });
  console.log('Save All button text (dirty count):', dirtyCountText);

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Save All'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(OUT_DIR, 'ev6-bulk-saved.png'), fullPage: true });

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });

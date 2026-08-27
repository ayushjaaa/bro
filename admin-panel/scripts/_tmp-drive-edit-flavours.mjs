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
  await page.screenshot({ path: path.join(OUT_DIR, 'ev1-edit-page.png'), fullPage: true });

  // Edit row 1 (Original federal): bump price, set quantity, save just that row.
  await page.evaluate(() => {
    const row = document.querySelectorAll('table tbody tr')[0];
    const priceInput = row.querySelectorAll('input')[1]; // description(0), price(1)? recompute below
  });

  // Recompute column order precisely: Description(input0), Region(select), Price(input1), Compare-at(input2), Quantity(input3), SKU(input4)
  await page.evaluate(() => {
    const row = document.querySelectorAll('table tbody tr')[0];
    const inputs = row.querySelectorAll('input');
    inputs[1].value = '6.99'; // price
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    inputs[3].value = '100'; // quantity
    inputs[3].dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.screenshot({ path: path.join(OUT_DIR, 'ev2-row-edited.png') });

  await page.evaluate(() => {
    const row = document.querySelectorAll('table tbody tr')[0];
    const saveBtn = [...row.querySelectorAll('button')].find((b) => b.textContent?.includes('Save'));
    saveBtn?.click();
  });
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(OUT_DIR, 'ev3-single-row-saved.png') });
  let text = await page.evaluate(() => document.body.innerText);
  console.log('single-row save success (Updated 1, failed 0):', text.includes('Updated 1, failed 0'));

  // Now edit rows 2 and 3, use Save All (bulk).
  await page.evaluate(() => {
    const row2 = document.querySelectorAll('table tbody tr')[1];
    const inputs2 = row2.querySelectorAll('input');
    inputs2[3].value = '25';
    inputs2[3].dispatchEvent(new Event('input', { bubbles: true }));

    const row3 = document.querySelectorAll('table tbody tr')[2];
    const inputs3 = row3.querySelectorAll('input');
    inputs3[3].value = '30';
    inputs3[3].dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Save All'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: path.join(OUT_DIR, 'ev4-bulk-saved.png'), fullPage: true });
  text = await page.evaluate(() => document.body.innerText);
  console.log('bulk save success (Updated 2, failed 0):', text.includes('Updated 2, failed 0'));

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });

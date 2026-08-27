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

  // Step 1: create a fresh test Product Line (Rolling Papers / RAW)
  await page.goto('http://localhost:3000/products/new', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Smoking'))?.click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Rolling Papers'))?.click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('RAW'))?.click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.type('input[name="title"]', 'Automation Image Verify Product');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Create Product Line'))?.click(); });
  await new Promise((r) => setTimeout(r, 4000));
  console.log('created product, now on:', page.url());

  // Step 2: find the new product's detail page from the list
  await page.goto('http://localhost:3000/products', { waitUntil: 'networkidle0' });
  const productHref = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a')].find((a) => a.textContent?.includes('Automation Image Verify Product'));
    return link ? link.getAttribute('href') : null;
  });
  console.log('product detail href:', productHref);
  if (!productHref) throw new Error('could not find created product in list');

  // Step 3: go to its Add Flavours page
  await page.goto(`http://localhost:3000${productHref}/variants`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(OUT_DIR, 'fc1-variants-page.png') });

  // Fill row 1
  await page.type('input[placeholder="e.g. Blue Razz"]', 'Original');
  const descInputs = await page.$$('table input');
  // Fill description (2nd input in first row)
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('table tbody tr')[0].querySelectorAll('input')];
    inputs[1].value = 'Classic taste';
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('table tbody tr')[0].querySelectorAll('input')];
    inputs[2].value = '5.99'; // price
    inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.screenshot({ path: path.join(OUT_DIR, 'fc2-row-filled.png') });

  // Click "Dup regions" to expand to all 6 regions
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Dup regions'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  const rowCountAfterDup = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
  console.log('rows after duplicate-to-other-regions:', rowCountAfterDup);
  await page.screenshot({ path: path.join(OUT_DIR, 'fc3-after-dup.png'), fullPage: true });

  // Submit
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Create All'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 5000));
  await page.screenshot({ path: path.join(OUT_DIR, 'fc4-after-submit.png'), fullPage: true });
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('result text includes "Created 6":', bodyText.includes('Created 6'));

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });

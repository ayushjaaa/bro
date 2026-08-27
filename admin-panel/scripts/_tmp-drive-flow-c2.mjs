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

  await page.goto('http://localhost:3000/products', { waitUntil: 'networkidle0' });
  const productHref = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a')].find((a) => a.textContent?.includes('Automation Image Verify Product'));
    return link ? link.getAttribute('href') : null;
  });
  console.log('reusing existing test product:', productHref);

  await page.goto(`http://localhost:3000${productHref}/variants`, { waitUntil: 'networkidle0' });

  // Fill row 0 precisely via nth-child cell selectors.
  await page.type('table tbody tr:first-child td:nth-child(1) input', 'ImgFixTest');
  await page.type('table tbody tr:first-child td:nth-child(2) input', 'Classic taste');
  await page.type('table tbody tr:first-child td:nth-child(4) input', '5.99');

  // Attach an image to row 0.
  const imgInput = await page.$('table tbody tr:first-child td:nth-child(7) input[type="file"]');
  await imgInput.uploadFile('/Users/ayushjaiswal/Downloads/new varinat and the category/admin-panel/public/next.svg'.trim());

  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT_DIR, 'g1-row-filled.png') });

  // Duplicate to other regions -- should now carry price/description/image forward.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Dup regions'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  const rowCount = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
  const imageIndicatorCount = await page.evaluate(() => document.body.innerText.split('✓').length - 1);
  console.log('rows after dup:', rowCount, '| rows showing image-attached indicator:', imageIndicatorCount);
  await page.screenshot({ path: path.join(OUT_DIR, 'g2-after-dup.png'), fullPage: true });

  // Submit
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Create All'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 8000));
  await page.screenshot({ path: path.join(OUT_DIR, 'g3-after-submit.png'), fullPage: true });
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('result mentions Created 6:', bodyText.includes('Created 6'));
  console.log('result mentions failed 0:', bodyText.includes('failed 0'));

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });

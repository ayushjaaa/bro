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
  await page.setViewport({ width: 1280, height: 900 });
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
    const link = [...document.querySelectorAll('a')].find((a) => a.textContent?.includes('RAW Classic'));
    return link ? link.getAttribute('href') : null;
  });
  console.log('RAW product href:', productHref);

  await page.goto(`http://localhost:3000${productHref}`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(OUT_DIR, 'pub1-before-publish.png') });

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Publish');
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(OUT_DIR, 'pub2-after-publish-click.png') });

  await page.reload({ waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(OUT_DIR, 'pub3-after-reload.png') });
  const text = await page.evaluate(() => document.body.innerText);
  console.log('shows Live now:', text.includes('● Live'));
  console.log('shows Unpublish button:', text.includes('Unpublish'));
  console.log('shows storefront link:', text.includes('View on storefront'));

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });

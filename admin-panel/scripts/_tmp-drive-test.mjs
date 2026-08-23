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
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  console.log('nav -> /login');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(OUT_DIR, '1-login.png') });

  await page.type('input[type="email"]', 'automation-test-admin@example.com');
  await page.type('input[type="password"]', 'TestAutomation123!');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('button[type="submit"]'),
  ]);
  console.log('after login, url:', page.url());
  await page.screenshot({ path: path.join(OUT_DIR, '2-dashboard.png') });

  console.log('nav -> /products/new');
  await page.goto('http://localhost:3000/products/new', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(OUT_DIR, '3-products-new.png') });

  // Click the Category select (the button whose text is the placeholder) to open the dropdown
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Select category')
    );
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  console.log('clicked category button:', clicked);
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(OUT_DIR, '4-category-open.png') });

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');

  await browser.close();
}

main().catch((err) => {
  console.error('Driver failed:', err);
  process.exit(1);
});

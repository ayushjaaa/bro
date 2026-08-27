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

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('input[type="email"]', 'automation-test-admin@example.com');
  await page.type('input[type="password"]', 'TestAutomation123!');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto('http://localhost:3000/products/10436857332012', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(OUT_DIR, 'h1-detail-with-flavour-images.png'), fullPage: true });

  const imgCount = await page.evaluate(() => document.querySelectorAll('table img').length);
  console.log('images rendered in Flavours table:', imgCount);

  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });
    
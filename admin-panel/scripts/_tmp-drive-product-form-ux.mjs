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

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
  await page.type('input[type="email"]', 'automation-test-admin@example.com');
  await page.type('input[type="password"]', 'TestAutomation123!');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto('http://localhost:3000/products/new', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(OUT_DIR, 'q1-all-categories.png') });

  const bodyText1 = await page.evaluate(() => document.body.innerText);
  console.log('Shows all 4 categories:', ['Vapes', 'Smoking', 'Cannabis Accessories', 'Convenience'].every((c) => bodyText1.includes(c)));

  // Click Smoking, then a 0-brand sub-category (Glass is under Cannabis, let's do Smoking's "Blunts & Wraps")
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Smoking'))?.click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT_DIR, 'q2-smoking-subs.png') });

  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Blunts & Wraps'))?.click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT_DIR, 'q3-empty-brand-message.png') });
  const bodyText2 = await page.evaluate(() => document.body.innerText);
  console.log('Shows "No Brands added yet" message:', bodyText2.includes('No Brands added yet'));

  // Now click a sub-category WITH brands: Rolling Papers
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Rolling Papers'))?.click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT_DIR, 'q4-rolling-papers-brands.png') });

  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('RAW'))?.click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT_DIR, 'q5-form-revealed.png') });
  const bodyText3 = await page.evaluate(() => document.body.innerText);
  console.log('Shows Product Line Name field after brand pick:', bodyText3.includes('Product Line Name'));

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });

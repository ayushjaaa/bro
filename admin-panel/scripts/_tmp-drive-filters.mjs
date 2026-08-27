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

  await page.goto('http://localhost:3000/taxonomy', { waitUntil: 'networkidle0' });

  // Expand "Smoking", then "Rolling Papers"
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Smoking'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Rolling Papers'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: path.join(OUT_DIR, 'f1-expanded.png') });

  // Click "+ Manage Filters" for Rolling Papers
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent?.includes('Manage Filters'));
    if (btns[0]) { btns[0].click(); return true; }
    return false;
  });
  console.log('clicked Manage Filters:', clicked);
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT_DIR, 'f2-form-open.png') });

  await page.type('input[name="label"]', 'Material');
  await page.type('input[name="key"]', 'rolling_paper_material');
  await page.type('input[name="choices"]', 'Hemp, Rice, Unbleached');

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Add Filter'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(OUT_DIR, 'f3-after-submit.png') });

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('\nContains "Material" chip after submit:', bodyText.includes('Material'));
  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });

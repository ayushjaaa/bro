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

  console.log('nav -> /taxonomy');
  await page.goto('http://localhost:3000/taxonomy', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(OUT_DIR, 't1-tree.png') });

  // Expand the "Vapes" category
  const expanded = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Vapes'));
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log('expanded Vapes:', expanded);
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: path.join(OUT_DIR, 't2-expanded.png') });

  // Click "+ Add Sub-category" for that category
  const clickedAdd = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Add Sub-category'));
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log('clicked Add Sub-category:', clickedAdd);
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: path.join(OUT_DIR, 't3-form-open.png') });

  // Fill and submit the inline form
  await page.type('input[name="name"]', 'Automation Test Sub-category');
  await Promise.all([
    page.waitForFunction(
      () => ![...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Saving...')),
      { timeout: 10000 }
    ).catch(() => {}),
    page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Add Sub-category'));
      btn?.click();
    }),
  ]);
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT_DIR, 't4-after-submit.png') });

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });

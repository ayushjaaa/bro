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

  await page.goto('http://localhost:3000/taxonomy', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Smoking'))?.click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Rolling Papers'))?.click(); });
  await new Promise((r) => setTimeout(r, 200));

  // Click the "Material" chip
  const clickedChip = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Material');
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log('clicked Material chip:', clickedChip);
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: path.join(OUT_DIR, 'e1-chip-open.png') });

  // Try adding a value that already exists (case-different) -- should error client-side (DAL check)
  await page.type('input[placeholder="Add value..."]', 'hemp');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Add')?.click(); });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(OUT_DIR, 'e2-dedup-error.png') });
  const text1 = await page.evaluate(() => document.body.innerText);
  console.log('shows dedup error:', text1.includes('already exists'));

  // Clear and add a genuinely new value
  await page.evaluate(() => {
    const input = document.querySelector('input[placeholder="Add value..."]');
    if (input) input.value = '';
  });
  await page.type('input[placeholder="Add value..."]', 'Bamboo');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Add')?.click(); });
  await new Promise((r) => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(OUT_DIR, 'e3-after-add.png') });

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });

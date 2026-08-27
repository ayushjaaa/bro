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

  // Step 1: create a test filter on "Rolling Papers" so we can verify the dynamic dropdown.
  await page.goto('http://localhost:3000/taxonomy', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Smoking'))?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Rolling Papers'))?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Manage Filters'))?.click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.type('input[name="label"]', 'TestMaterial');
  await page.type('input[name="key"]', 'rolling_paper_test_material');
  await page.type('input[name="choices"]', 'Hemp, Rice, Unbleached');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Add Filter'))?.click(); });
  await new Promise((r) => setTimeout(r, 6000));
  console.log('filter created');

  // Step 2: go to /products/new, pick a Rolling Papers brand (RAW), fill the form.
  await page.goto('http://localhost:3000/products/new', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(OUT_DIR, 'p1-form.png') });

  await page.select('select[name="brandId"]', await page.evaluate(() => {
    const opt = [...document.querySelectorAll('select[name="brandId"] option')].find((o) => o.textContent?.trim() === 'RAW');
    return opt ? opt.value : '';
  }));
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: path.join(OUT_DIR, 'p2-brand-selected.png') });

  const hasTestMaterialField = await page.evaluate(() =>
    document.body.innerText.includes('TestMaterial')
  );
  console.log('TestMaterial dropdown rendered after brand select:', hasTestMaterialField);

  await page.type('input[name="title"]', 'Automation Test RAW Papers');
  const selected = await page.evaluate(() => {
    const sel = [...document.querySelectorAll('select')].find((s) => s.name?.startsWith('filter:'));
    if (!sel) return false;
    sel.value = 'Hemp';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  console.log('selected Hemp in filter dropdown:', selected);

  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Create Product Line'))?.click(); });
  await new Promise((r) => setTimeout(r, 6000));
  await page.screenshot({ path: path.join(OUT_DIR, 'p3-after-submit.png') });
  console.log('final url:', page.url());

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });

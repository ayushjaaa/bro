import puppeteer from 'puppeteer';
import path from 'node:path';

const OUT_DIR = '/tmp/admin-panel-screenshots';
const NEW_SUBCATEGORY_NAME = 'Hookah Charcoal'; // deliberately NOT one of the 24 seeded sub-categories

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
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Cannabis Accessories'))?.click(); });
  await new Promise((r) => setTimeout(r, 300));

  // Add a brand-new Sub-category "Hookah Charcoal" under Cannabis Accessories -- scope to the
  // <li> containing "Cannabis Accessories" text, since "+ Add Sub-category" appears once per
  // category and a plain global .find() would grab Vapes' button instead (first in DOM order).
  await page.evaluate(() => {
    const li = [...document.querySelectorAll('li')].find((el) => el.textContent?.includes('Cannabis Accessories'));
    const btn = li ? [...li.querySelectorAll('button')].find((b) => b.textContent?.includes('Add Sub-category')) : null;
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  await page.type('input[name="name"]', NEW_SUBCATEGORY_NAME);
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Add Sub-category'))?.click(); });
  await new Promise((r) => setTimeout(r, 3000));
  console.log('created new sub-category:', NEW_SUBCATEGORY_NAME);
  await page.screenshot({ path: path.join(OUT_DIR, 's0-after-create.png') });

  // Expand Cannabis Accessories if not already, then the new sub-category, then Manage Filters --
  // scope every click to the <li> containing the relevant text, not a global .find().
  const isExpanded = await page.evaluate((name) => {
    const li = [...document.querySelectorAll('li')].find((el) => el.textContent?.includes('Cannabis Accessories'));
    return li ? li.textContent?.includes(name) : false;
  }, NEW_SUBCATEGORY_NAME);
  if (!isExpanded) {
    await page.evaluate(() => {
      const li = [...document.querySelectorAll('li')].find((el) => el.textContent?.includes('Cannabis Accessories'));
      const btn = li?.querySelector('button');
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 300));
  }

  await page.evaluate((name) => {
    // find the button whose own direct text (not descendants) includes the name
    const btn = [...document.querySelectorAll('button')].find((b) => [...b.childNodes].some((n) => n.nodeType === 3 && n.textContent?.includes(name)));
    btn?.click();
  }, NEW_SUBCATEGORY_NAME);
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: path.join(OUT_DIR, 's0b-subcategory-expanded.png') });

  await page.evaluate((name) => {
    const li = [...document.querySelectorAll('li')].find((el) => el.textContent?.includes(name) && el.textContent?.includes('Manage Filters'));
    const btn = li ? [...li.querySelectorAll('button')].find((b) => b.textContent?.includes('Manage Filters')) : null;
    btn?.click();
  }, NEW_SUBCATEGORY_NAME);
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: path.join(OUT_DIR, 's1-new-subcategory-filter-form.png') });

  // Type Label "Material" and check the auto-generated Key
  await page.type('input[placeholder="Label (e.g. Material)"]', 'Material');
  await new Promise((r) => setTimeout(r, 200));
  const keyValue = await page.evaluate(() => document.querySelector('input[placeholder="Key (auto-suggested)"]')?.value);
  console.log('Auto-generated key for "Material" under "Hookah Charcoal":', keyValue);
  console.log('Expected: hookah_charcoal_material | Match:', keyValue === 'hookah_charcoal_material');
  await page.screenshot({ path: path.join(OUT_DIR, 's2-auto-key-shown.png') });

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => { console.error('Driver failed:', err); process.exit(1); });

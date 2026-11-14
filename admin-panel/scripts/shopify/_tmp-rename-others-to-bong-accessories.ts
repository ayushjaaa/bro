/**
 * Renames the Cannabis accessories mega-menu group "Others" (Cleaning, Replacement Parts) to
 * "Bong Accessories". Only the two collections' custom.menu_group_label changes; the sections,
 * their URLs and Convenience's own "Others" group are untouched. The menu and the listing sidebar
 * both read this field, so both follow. Idempotent. To roll back, swap FROM and TO and run again.
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-rename-others-to-bong-accessories.ts
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { setMegaMenuMetafields } from '../../src/lib/shopify/collection-helpers.core';

const FROM = 'Others';
const TO = 'Bong Accessories';

async function main() {
  const r: any = await shopifyAdminRequest<any>(`{collections(first:250){nodes{id title
    nav:metafield(namespace:"custom",key:"menu_nav_key"){value} group:metafield(namespace:"custom",key:"menu_group_label"){value}}}}`);
  const targets = r.collections.nodes.filter((c: any) => c.nav?.value?.trim() === 'cannabis-accessories' && c.group?.value?.trim() === FROM);
  if (targets.length === 0) { console.log(`no Cannabis accessories collection in group "${FROM}" (already renamed?)`); return; }
  for (const c of targets) {
    await setMegaMenuMetafields(c.id, { groupLabel: TO });
    console.log(`${c.title}: menu group "${FROM}" -> "${TO}"`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

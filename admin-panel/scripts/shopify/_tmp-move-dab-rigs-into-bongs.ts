/**
 * Moves the mega menu's "Dab Rigs" group (Dab Rigs, Nectar Collectors, E-Rigs, Dab Rig Accessories)
 * into the "Bongs" group under Cannabis accessories, as the client asked, and re-numbers the Bongs
 * list so Dab Rigs sits right after Beaker Bongs. Only the collections' menu metafields change --
 * no product, variant, sub-category or URL is touched. Idempotent. Run:
 *   npx tsx --env-file=.env.local scripts/shopify/_tmp-move-dab-rigs-into-bongs.ts
 *
 * Before (to roll back): Bongs = Straight Tube 1, Beaker 2, Water Pipes 3, Glass 4, Silicone 5,
 * Recycler 6, Zong 7, Gun 8, Oil Bongs 9; "Dab Rigs" group = Dab Rigs 1, Nectar Collectors 2,
 * E-Rigs 3, Dab Rig Accessories 4.
 */
import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
import { setMegaMenuMetafields } from '../../src/lib/shopify/collection-helpers.core';

const BONGS_ORDER = [
  'Straight Tube Bongs', 'Beaker Bongs', 'Dab Rigs', 'Water Pipes', 'Glass Bongs', 'Silicone Bongs',
  'Recycler Bongs', 'Zong Bongs', 'Gun Bongs', 'Oil Bongs', 'Nectar Collectors', 'E-Rigs', 'Dab Rig Accessories',
];

async function main() {
  const r: any = await shopifyAdminRequest<any>(`{collections(first:250){nodes{id title nav:metafield(namespace:"custom",key:"menu_nav_key"){value}}}}`);
  const cannabis = r.collections.nodes.filter((c: any) => c.nav?.value?.trim() === 'cannabis-accessories');
  for (const [i, title] of BONGS_ORDER.entries()) {
    const matches = cannabis.filter((c: any) => c.title === title);
    if (matches.length !== 1) throw new Error(`expected exactly 1 Cannabis accessories collection "${title}", found ${matches.length}`);
    await setMegaMenuMetafields(matches[0].id, { groupLabel: 'Bongs', groupMode: 'subcategory', sortOrder: i + 1 });
    console.log(`Bongs #${i + 1}  ${title}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

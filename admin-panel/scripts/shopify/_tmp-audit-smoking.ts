import { shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';
// Read-only: smoking-menu collections with grouping + rules, and brands per smoking sub_category.
async function main() {
  const d = await shopifyAdminRequest<any>(`query {
    cols: collections(first: 250) { nodes { id title handle productsCount { count } ruleSet { appliedDisjunctively rules { column condition } }
      nav: metafield(namespace: "custom", key: "menu_nav_key") { value }
      label: metafield(namespace: "custom", key: "menu_group_label") { value }
      mode: metafield(namespace: "custom", key: "menu_group_mode") { value }
      sort: metafield(namespace: "custom", key: "menu_sort_order") { value } } }
    brands: metaobjects(type: "brand", first: 250) { nodes { id fields { key value } } }
  }`);
  for (const c of d.cols.nodes) if (c.nav?.value === 'smoking' || /lighter|butane|tobacco|flint|wick/i.test(c.title))
    console.log(JSON.stringify({ t: c.title, h: c.handle, n: c.productsCount.count, nav: c.nav?.value, label: c.label?.value, mode: c.mode?.value, sort: c.sort?.value, rules: c.ruleSet?.rules }));
  const smokingSubs = ['252081373382','252081406150','252081438918','252081733830','264013381830','264013447366','264014463174'];
  for (const b of d.brands.nodes) { const f = Object.fromEntries(b.fields.map((x: any) => [x.key, x.value]));
    if (smokingSubs.some((s) => String(f.sub_category).includes(s))) console.log('BRAND', f.name, f.sub_category); }
}
main().catch((e) => { console.error(e); process.exit(1); });

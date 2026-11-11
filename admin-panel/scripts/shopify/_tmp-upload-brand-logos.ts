/**
 * TEMPORARY: uploads the SEO team's brand logos (storefront/brandlogo/*.png) onto the matching
 * Shopify Brand metaobjects' `logo` field -- every metaobject with that exact brand name (a brand
 * has one entry per sub-category). Matching is by brand name, never by file order.
 * Dry run by default; pass --apply to write. Prints each entry's previous logo GID so a change can
 * be undone.
 * Run: npx tsx --env-file=.env.local scripts/shopify/_tmp-upload-brand-logos.ts [--apply]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoUserErrors, shopifyAdminRequest } from '../../src/lib/shopify/admin-client.core';

const DIR = join(__dirname, '../../../storefront/brandlogo');

// file -> exact Shopify brand name (checked against the live brand list 2026-10-31).
const MAP: Record<string, string> = {
  'oxbar (2).png': 'Oxbar',
  'vaporesso.png': 'Vaporesso',
  'vfeel.png': 'VFEEL',
};

const LIST = /* GraphQL */ `query($after: String) { metaobjects(type: "brand", first: 250, after: $after) {
  pageInfo { hasNextPage endCursor }
  nodes { id name: field(key: "name") { value } logo: field(key: "logo") { value }
    sub: field(key: "sub_category") { reference { ... on Metaobject { name: field(key: "name") { value } } } } } } }`;
const STAGE = /* GraphQL */ `mutation($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) {
  stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } } }`;
const FILE_CREATE = /* GraphQL */ `mutation($files: [FileCreateInput!]!) { fileCreate(files: $files) {
  files { id fileStatus } userErrors { field message } } }`;
const UPDATE = /* GraphQL */ `mutation($id: ID!, $metaobject: MetaobjectUpdateInput!) { metaobjectUpdate(id: $id, metaobject: $metaobject) {
  metaobject { id } userErrors { field message } } }`;

async function upload(file: string): Promise<string> {
  const bytes = readFileSync(join(DIR, file));
  const staged: any = await shopifyAdminRequest(STAGE, {
    input: [{ filename: file, mimeType: 'image/png', httpMethod: 'POST', resource: 'IMAGE', fileSize: String(bytes.length) }],
  });
  assertNoUserErrors(staged.stagedUploadsCreate.userErrors, 'stagedUploadsCreate');
  const t = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const p of t.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([bytes], { type: 'image/png' }), file);
  const res = await fetch(t.url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`staged upload failed for ${file}: ${res.status}`);
  const created: any = await shopifyAdminRequest(FILE_CREATE, { files: [{ originalSource: t.resourceUrl, contentType: 'IMAGE', alt: file.replace(/ \(\d+\)/, '').replace('.png', '') }] });
  assertNoUserErrors(created.fileCreate.userErrors, 'fileCreate');
  return created.fileCreate.files[0].id;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const brands: any[] = [];
  let after: string | null = null;
  do {
    const d: any = await shopifyAdminRequest(LIST, { after });
    brands.push(...d.metaobjects.nodes);
    after = d.metaobjects.pageInfo.hasNextPage ? d.metaobjects.pageInfo.endCursor : null;
  } while (after);

  for (const [file, name] of Object.entries(MAP)) {
    const targets = brands.filter((b) => b.name?.value === name);
    console.log(`\n${file} -> "${name}": ${targets.length} entr${targets.length === 1 ? 'y' : 'ies'}`);
    for (const b of targets) console.log(`   ${b.id} | ${b.sub?.reference?.name?.value ?? '?'} | previous logo: ${b.logo?.value ?? 'none'}`);
    if (!targets.length) { console.log('   !! no brand with this name, skipped'); continue; }
    if (!apply) continue;
    const fileId = await upload(file);
    for (const b of targets) {
      const r: any = await shopifyAdminRequest(UPDATE, { id: b.id, metaobject: { fields: [{ key: 'logo', value: fileId }] } });
      assertNoUserErrors(r.metaobjectUpdate.userErrors, 'metaobjectUpdate');
    }
    console.log(`   uploaded ${fileId} and set on ${targets.length}`);
  }
  console.log(apply ? '\nDone.' : '\nDry run only -- pass --apply to write.');
}

main().catch((e) => { console.error(e); process.exit(1); });

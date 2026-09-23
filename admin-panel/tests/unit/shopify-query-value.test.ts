import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { quoteShopifySearchValue } from '../../src/lib/shopify/query-value';

describe('quoteShopifySearchValue', () => {
  it('leaves real emails intact (only wrapped in quotes)', () => {
    for (const e of ['buyer@store.ca', 'first.last+promo@sub.example.co.uk', "o'brien@x.com".replace("'", '')]) {
      assert.equal(quoteShopifySearchValue(e), `'${e}'`);
    }
  });
  it("escapes an apostrophe in a legal email (o'brien@x.com)", () => {
    assert.equal(quoteShopifySearchValue("o'brien@x.com"), "'o\\'brien@x.com'");
  });
  it('turns search operators into plain text', () => {
    assert.equal(quoteShopifySearchValue('a@x.com OR email:*'), "'a@x.com OR email\\:*'");
    assert.equal(quoteShopifySearchValue('x) OR (y'), "'x\\) OR \\(y'");
    assert.equal(quoteShopifySearchValue("' OR '1'='1"), "'\\' OR \\'1\\'=\\'1'");
    assert.equal(quoteShopifySearchValue('-a@x.com'), "'\\-a@x.com'");
    assert.equal(quoteShopifySearchValue('a\\'), "'a\\\\'");
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeRelativePath } from '../../src/lib/safe-redirect';

const BASE = 'https://admin.example';

describe('safeRelativePath (post-login redirect target)', () => {
  it('keeps ordinary same-site paths, with query strings and fragments', () => {
    for (const ok of ['/', '/customers', '/customers?tab=carts', '/products/123#stock', '/set-password']) {
      assert.equal(safeRelativePath(ok), ok);
    }
  });

  it('falls back for absolute URLs, protocol-relative URLs and other schemes', () => {
    for (const bad of ['https://evil.example', 'http://evil.example', '//evil.example', '///evil.example', 'javascript:alert(1)', 'data:text/html,x', 'evil.example', 'mailto:a@b.c']) {
      assert.equal(safeRelativePath(bad), '/', JSON.stringify(bad));
    }
  });

  it('falls back for backslash tricks and control characters (browsers strip tab/newline: "/\\t/evil" -> "//evil")', () => {
    for (const bad of ['/\\evil.example', '/\\/evil.example', '/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '/ /evil.example', '/\u0000x']) {
      assert.equal(safeRelativePath(bad), '/', JSON.stringify(bad));
    }
  });

  it('falls back for empty / missing / non-string input, and honours a custom fallback', () => {
    for (const bad of ['', null, undefined]) assert.equal(safeRelativePath(bad as string), '/');
    assert.equal(safeRelativePath('https://evil.example', '/login'), '/login');
  });

  it('EVERY output resolves to the site’s own origin (property check over many inputs)', () => {
    const inputs = ['/', '/a', '//a', 'https://a', '/\\a', '/\t/a', '///a', '/%2F%2Fa', '/a//b', 'javascript:1', '', 'x', '/ok?next=//evil', '/a b'];
    for (const raw of inputs) {
      const out = safeRelativePath(raw);
      assert.equal(new URL(out, BASE).origin, BASE, `${JSON.stringify(raw)} -> ${out}`);
    }
  });
});

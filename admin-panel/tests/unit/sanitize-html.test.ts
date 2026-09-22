import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeProductHtml } from '../../src/lib/sanitize-html';

describe('sanitizeProductHtml (admin product description)', () => {
  it('keeps ordinary rich text unchanged: paragraphs, bold, lists, headings, quotes', () => {
    const html = '<h2>Specs</h2><p>Strong <strong>nicotine</strong> and <em>smooth</em>.</p><ul><li>One</li><li>Two</li></ul><blockquote>Note</blockquote>';
    assert.equal(sanitizeProductHtml(html), html);
  });

  it('keeps links (http/https/mailto) and forces rel="noopener noreferrer"', () => {
    const out = sanitizeProductHtml('<a href="https://example.com/x" title="t">site</a> <a href="mailto:a@b.co">mail</a>');
    assert.match(out, /<a href="https:\/\/example\.com\/x" title="t" rel="noopener noreferrer">site<\/a>/);
    assert.match(out, /href="mailto:a@b\.co"/);
  });

  it('overrides an attacker-supplied rel', () => {
    assert.match(sanitizeProductHtml('<a href="https://e.co" rel="opener">x</a>'), /rel="noopener noreferrer"/);
  });

  it('keeps https images and tables', () => {
    const out = sanitizeProductHtml('<img src="https://cdn.shopify.com/a.png" alt="a" width="10"><table><tbody><tr><td colspan="2">x</td></tr></tbody></table>');
    assert.match(out, /<img src="https:\/\/cdn\.shopify\.com\/a\.png" alt="a" width="10" \/>/);
    assert.match(out, /<td colspan="2">x<\/td>/);
  });

  it('removes <script> including its contents', () => {
    const out = sanitizeProductHtml('<p>hi</p><script>alert(document.cookie)</script>');
    assert.equal(out, '<p>hi</p>');
  });

  it('removes event-handler attributes (onerror, onclick, onload, onmouseover)', () => {
    for (const html of ['<img src="https://a.co/x.png" onerror="alert(1)">', '<p onclick="alert(1)">x</p>', '<div onmouseover="alert(1)">x</div>', '<body onload="alert(1)">x</body>']) {
      assert.doesNotMatch(sanitizeProductHtml(html), /on\w+\s*=/i, html);
    }
  });

  it('removes javascript: / vbscript: / data: URLs from links and images', () => {
    for (const html of [
      '<a href="javascript:alert(1)">x</a>', '<a href=" JaVaScRiPt:alert(1)">x</a>', '<a href="java\tscript:alert(1)">x</a>',
      '<a href="vbscript:msgbox(1)">x</a>', '<a href="data:text/html,<script>alert(1)</script>">x</a>',
      '<img src="javascript:alert(1)">', '<img src="data:image/svg+xml;base64,PHN2Zz4=">',
    ]) {
      assert.doesNotMatch(sanitizeProductHtml(html), /javascript:|vbscript:|data:/i, html);
    }
  });

  it('removes plain http images (https only) and protocol-relative URLs', () => {
    assert.doesNotMatch(sanitizeProductHtml('<img src="http://a.co/x.png">'), /src=/);
    assert.doesNotMatch(sanitizeProductHtml('<a href="//evil.example/x">x</a>'), /href=/);
  });

  it('removes iframe, object, embed, form, input, style, link, meta, base, svg, math', () => {
    for (const tag of ['<iframe src="https://evil.example"></iframe>', '<object data="x"></object>', '<embed src="x">', '<form action="https://evil.example"><input name="p"></form>', '<style>body{display:none}</style>', '<link rel="stylesheet" href="https://evil.example/x.css">', '<meta http-equiv="refresh" content="0;url=https://evil.example">', '<base href="https://evil.example/">', '<svg onload="alert(1)"><circle/></svg>', '<math><mi>x</mi></math>']) {
      const out = sanitizeProductHtml(`<p>ok</p>${tag}`);
      assert.doesNotMatch(out, /<(iframe|object|embed|form|input|style|link|meta|base|svg|math)\b/i, tag);
    }
  });

  it('drops inline style and class attributes', () => {
    const out = sanitizeProductHtml('<p style="background:url(javascript:alert(1))" class="x">t</p>');
    assert.equal(out, '<p>t</p>');
  });

  it('survives malformed / nested / mixed-case tricks', () => {
    for (const html of ['<scr<script>ipt>alert(1)</scr</script>ipt>', '<IMG SRC=x ONERROR=alert(1)>', '<a href="x" onclick=alert(1)//>x</a>', '<p/onmouseover=alert(1)>x</p>', '<svg/onload=alert(1)>', '<<script>alert(1);//<</script>']) {
      const out = sanitizeProductHtml(html);
      assert.doesNotMatch(out, /<script|on\w+\s*=/i, html);
    }
  });

  it('empty / null / undefined -> empty string', () => {
    for (const v of ['', null, undefined]) assert.equal(sanitizeProductHtml(v), '');
  });

  it('is idempotent: sanitising already-clean output changes nothing', () => {
    const once = sanitizeProductHtml('<p onclick="x">a <b>b</b> <a href="https://e.co">c</a></p><script>1</script>');
    assert.equal(sanitizeProductHtml(once), once);
  });
});

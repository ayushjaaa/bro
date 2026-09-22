import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { flavorCountForLine, flavorCountForBrand, flavorCountForSubcategory, flavorCountForCategory, breadcrumbFor } from '../../src/lib/helpers';
import { REGIONS } from '../../src/lib/regions';

const categories = [{ id: 'c1', name: 'Vape' }, { id: 'c2', name: 'Smoking' }] as any[];
const subs = [{ id: 's1', categoryId: 'c1', name: 'Disposables' }, { id: 's2', categoryId: 'c2', name: 'Papers' }] as any[];
const brands = [{ id: 'b1', subcategoryId: 's1', name: 'Elf' }, { id: 'b2', subcategoryId: 's2', name: 'RAW' }] as any[];
const lines = [{ id: 'l1', brandId: 'b1', name: '5000' }, { id: 'l2', brandId: 'b2', name: 'Classic' }] as any[];
const flavors = [
  { id: 'f1', productLineId: 'l1' }, { id: 'f2', productLineId: 'l1' }, { id: 'f3', productLineId: 'l2' },
] as any[];

describe('taxonomy flavour counts (numbers shown on the taxonomy page)', () => {
  it('count per line / brand / subcategory / category roll up correctly', () => {
    assert.equal(flavorCountForLine(flavors, 'l1'), 2);
    assert.equal(flavorCountForBrand(flavors, lines, 'b1'), 2);
    assert.equal(flavorCountForSubcategory(flavors, lines, brands, 's1'), 2);
    assert.equal(flavorCountForCategory(flavors, lines, brands, subs, 'c2'), 1);
  });
  it('unknown ids and empty inputs give 0, never throw', () => {
    assert.equal(flavorCountForLine(flavors, 'nope'), 0);
    assert.equal(flavorCountForBrand([], [], 'b1'), 0);
    assert.equal(flavorCountForCategory(flavors, lines, brands, subs, 'ghost'), 0);
  });
  it('a brand with no lines counts 0 (empty brand is a valid state)', () => {
    assert.equal(flavorCountForBrand(flavors, [], 'b1'), 0);
  });
});

describe('breadcrumbFor', () => {
  it('builds the trail in order', () => {
    assert.deepEqual(breadcrumbFor({ categoryId: 'c1', subcategoryId: 's1', brandId: 'b1', productLineId: 'l1' } as any, categories, subs, brands, lines),
      ['Vape', 'Disposables', 'Elf', '5000']);
  });
  it('skips levels that are unset or point at a deleted record (no empty crumbs)', () => {
    assert.deepEqual(breadcrumbFor({ categoryId: 'c1', subcategoryId: 'gone' } as any, categories, subs, brands, lines), ['Vape']);
    assert.deepEqual(breadcrumbFor({} as any, categories, subs, brands, lines), []);
  });
});

describe('admin region list', () => {
  it('has the six excise regions, no duplicates, values lower-case', () => {
    assert.deepEqual(REGIONS.map((r) => r.value), ['federal', 'bc', 'alberta', 'manitoba', 'ontario', 'quebec']);
  });
});

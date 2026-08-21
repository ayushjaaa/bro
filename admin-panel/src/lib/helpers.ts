import { Brand, Category, Flavor, ProductLine, Subcategory, TaxonomyContext } from "./types";

export function flavorCountForLine(flavors: Flavor[], lineId: string) {
  return flavors.filter((f) => f.productLineId === lineId).length;
}

export function flavorCountForBrand(flavors: Flavor[], lines: ProductLine[], brandId: string) {
  const lineIds = new Set(lines.filter((l) => l.brandId === brandId).map((l) => l.id));
  return flavors.filter((f) => lineIds.has(f.productLineId)).length;
}

export function flavorCountForSubcategory(
  flavors: Flavor[],
  lines: ProductLine[],
  brands: Brand[],
  subcategoryId: string
) {
  const brandIds = new Set(brands.filter((b) => b.subcategoryId === subcategoryId).map((b) => b.id));
  const lineIds = new Set(lines.filter((l) => brandIds.has(l.brandId)).map((l) => l.id));
  return flavors.filter((f) => lineIds.has(f.productLineId)).length;
}

export function flavorCountForCategory(
  flavors: Flavor[],
  lines: ProductLine[],
  brands: Brand[],
  subcategories: Subcategory[],
  categoryId: string
) {
  const subIds = new Set(subcategories.filter((s) => s.categoryId === categoryId).map((s) => s.id));
  const brandIds = new Set(brands.filter((b) => subIds.has(b.subcategoryId)).map((b) => b.id));
  const lineIds = new Set(lines.filter((l) => brandIds.has(l.brandId)).map((l) => l.id));
  return flavors.filter((f) => lineIds.has(f.productLineId)).length;
}

export function breadcrumbFor(
  ctx: TaxonomyContext,
  categories: Category[],
  subcategories: Subcategory[],
  brands: Brand[],
  productLines: ProductLine[]
) {
  const parts: string[] = [];
  if (ctx.categoryId) parts.push(categories.find((c) => c.id === ctx.categoryId)?.name ?? "");
  if (ctx.subcategoryId) parts.push(subcategories.find((s) => s.id === ctx.subcategoryId)?.name ?? "");
  if (ctx.brandId) parts.push(brands.find((b) => b.id === ctx.brandId)?.name ?? "");
  if (ctx.productLineId) parts.push(productLines.find((l) => l.id === ctx.productLineId)?.name ?? "");
  return parts.filter(Boolean);
}

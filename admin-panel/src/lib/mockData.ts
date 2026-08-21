import { Brand, Category, Flavor, ProductLine, Subcategory } from "./types";

const categories: Category[] = [
  { id: "cat-eliquids", name: "E-Liquids" },
  { id: "cat-disposables", name: "Disposables" },
  { id: "cat-devices", name: "Devices" },
];

const subcategories: Subcategory[] = [
  { id: "sub-freebase", name: "Freebase E-Liquid", categoryId: "cat-eliquids" },
  { id: "sub-salt", name: "Nic Salt E-Liquid", categoryId: "cat-eliquids" },
  { id: "sub-disposable-vapes", name: "Disposable Vapes", categoryId: "cat-disposables" },
  { id: "sub-pod-systems", name: "Pod Systems", categoryId: "cat-devices" },
];

const brands: Brand[] = [
  { id: "brand-nasty", name: "Nasty Juice", subcategoryId: "sub-freebase" },
  { id: "brand-bad-drip", name: "Bad Drip", subcategoryId: "sub-freebase" },
  { id: "brand-vapetasia", name: "Vapetasia", subcategoryId: "sub-salt" },
  { id: "brand-lost-mary", name: "Lost Mary", subcategoryId: "sub-disposable-vapes" },
  { id: "brand-elf-bar", name: "Elf Bar", subcategoryId: "sub-disposable-vapes" },
  { id: "brand-geekvape", name: "Geekvape", subcategoryId: "sub-pod-systems" },
];

const productLines: ProductLine[] = [
  { id: "line-nasty-cush-man", name: "Cush Man Series", brandId: "brand-nasty" },
  { id: "line-nasty-fusion", name: "Fusion Series", brandId: "brand-nasty" },
  { id: "line-bad-drip-classic", name: "Classic Line", brandId: "brand-bad-drip" },
  { id: "line-vapetasia-killer-kustard", name: "Killer Kustard Line", brandId: "brand-vapetasia" },
  { id: "line-lost-mary-os", name: "OS Series", brandId: "brand-lost-mary" },
  { id: "line-elf-bar-bc", name: "BC5000 Series", brandId: "brand-elf-bar" },
  { id: "line-geekvape-aegis", name: "Aegis Pod Line", brandId: "brand-geekvape" },
];

const flavorNamePool = [
  "Mango Peach", "Strawberry Kiwi", "Blue Razz Ice", "Watermelon Bubblegum", "Pineapple Coconut",
  "Grape Soda", "Lemon Lime", "Cherry Cola", "Banana Custard", "Apple Peach",
  "Mixed Berry", "Cool Mint", "Menthol Ice", "Vanilla Tobacco", "Honeydew Melon",
  "Passionfruit Guava", "Dragon Fruit Lychee", "Kiwi Strawberry", "Peach Mango Ice", "Tropical Punch",
  "Blackcurrant Menthol", "Raspberry Lemonade", "Orange Cream", "Coconut Milk", "Cantaloupe Ice",
  "Guava Ice", "Lush Ice", "Sour Apple", "Pink Lemonade", "Root Beer Float",
];

function genFlavorsFor(productLineId: string, count: number, priceBase: number): Flavor[] {
  const list: Flavor[] = [];
  for (let i = 0; i < count; i++) {
    const base = flavorNamePool[i % flavorNamePool.length];
    const suffix = i >= flavorNamePool.length ? ` ${Math.floor(i / flavorNamePool.length) + 1}` : "";
    list.push({
      id: `${productLineId}-flavor-${i + 1}`,
      name: `${base}${suffix}`,
      productLineId,
      images: [null, null, null, null],
      price: (priceBase + (i % 5)).toFixed(2),
      description: `${base}${suffix} — a smooth, all-day-vape flavor.`,
      nicotineStrength: ["0mg", "3mg", "6mg", "12mg", "20mg", "50mg"][i % 6],
      puffCount: ["", "", "", "5000", "6000", "10000"][i % 6],
      createdAt: new Date(2026, 0, 1 + (i % 28)).toISOString(),
    });
  }
  return list;
}

const flavors: Flavor[] = [
  ...genFlavorsFor("line-nasty-cush-man", 24, 19.99),
  ...genFlavorsFor("line-nasty-fusion", 18, 19.99),
  ...genFlavorsFor("line-bad-drip-classic", 16, 21.99),
  ...genFlavorsFor("line-vapetasia-killer-kustard", 12, 22.99),
  ...genFlavorsFor("line-lost-mary-os", 108, 14.99),
  ...genFlavorsFor("line-elf-bar-bc", 60, 15.99),
  ...genFlavorsFor("line-geekvape-aegis", 8, 34.99),
];

export const seedData = { categories, subcategories, brands, productLines, flavors };

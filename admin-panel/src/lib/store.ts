import { create } from "zustand";
import { persist } from "zustand/middleware";
import { seedData } from "./mockData";
import { Brand, Category, Flavor, ProductLine, Subcategory, TaxonomyContext } from "./types";

function slugId(prefix: string, name: string) {
  return `${prefix}-${name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;
}

export type BulkRow = {
  key: string;
  name: string;
  images: (string | null)[];
  price: string;
  nicotineStrength: string;
};

export type NewFlavorInput = {
  name: string;
  productLineId: string;
  images: (string | null)[];
  price: string;
  description: string;
  nicotineStrength: string;
  puffCount: string;
};

type Store = {
  categories: Category[];
  subcategories: Subcategory[];
  brands: Brand[];
  productLines: ProductLine[];
  flavors: Flavor[];

  selectedContext: TaxonomyContext;
  setSelectedContext: (ctx: TaxonomyContext) => void;

  addCategory: (name: string) => Category;
  addSubcategory: (name: string, categoryId: string) => Subcategory;
  addBrand: (name: string, subcategoryId: string) => Brand;
  addProductLine: (name: string, brandId: string) => ProductLine;

  addFlavor: (input: NewFlavorInput) => Flavor;
  addFlavorsBulk: (productLineId: string, rows: BulkRow[]) => Flavor[];
};

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      categories: seedData.categories,
      subcategories: seedData.subcategories,
      brands: seedData.brands,
      productLines: seedData.productLines,
      flavors: seedData.flavors,

      selectedContext: {},
      setSelectedContext: (ctx) => set({ selectedContext: ctx }),

      addCategory: (name) => {
        const cat: Category = { id: slugId("cat", name), name };
        set((s) => ({ categories: [...s.categories, cat] }));
        return cat;
      },
      addSubcategory: (name, categoryId) => {
        const sub: Subcategory = { id: slugId("sub", name), name, categoryId };
        set((s) => ({ subcategories: [...s.subcategories, sub] }));
        return sub;
      },
      addBrand: (name, subcategoryId) => {
        const brand: Brand = { id: slugId("brand", name), name, subcategoryId };
        set((s) => ({ brands: [...s.brands, brand] }));
        return brand;
      },
      addProductLine: (name, brandId) => {
        const line: ProductLine = { id: slugId("line", name), name, brandId };
        set((s) => ({ productLines: [...s.productLines, line] }));
        return line;
      },

      addFlavor: (input) => {
        const flavor: Flavor = {
          id: slugId("flavor", input.name),
          name: input.name,
          productLineId: input.productLineId,
          images: input.images,
          price: input.price,
          description: input.description,
          nicotineStrength: input.nicotineStrength,
          puffCount: input.puffCount,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ flavors: [flavor, ...s.flavors] }));
        return flavor;
      },

      addFlavorsBulk: (productLineId, rows) => {
        const created: Flavor[] = rows
          .filter((r) => r.name.trim().length > 0)
          .map((r) => ({
            id: slugId("flavor", r.name),
            name: r.name,
            productLineId,
            images: r.images,
            price: r.price || "0.00",
            description: "",
            nicotineStrength: r.nicotineStrength,
            puffCount: "",
            createdAt: new Date().toISOString(),
          }));
        set((s) => ({ flavors: [...created, ...s.flavors] }));
        return created;
      },
    }),
    { name: "admin-panel-store" }
  )
);

// Derived helpers
export function useCounts() {
  const { categories, subcategories, brands, productLines, flavors } = useStore();
  return {
    categoryCount: categories.length,
    subcategoryCount: subcategories.length,
    brandCount: brands.length,
    productLineCount: productLines.length,
    flavorCount: flavors.length,
  };
}

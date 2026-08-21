"use client";

import { useStore } from "@/lib/store";
import { TaxonomyContext } from "@/lib/types";
import SearchableSelect from "./SearchableSelect";

export default function TaxonomyPicker({
  value,
  onChange,
}: {
  value: TaxonomyContext;
  onChange: (ctx: TaxonomyContext) => void;
}) {
  const { categories, subcategories, brands, productLines, addCategory, addSubcategory, addBrand, addProductLine } =
    useStore();

  const subOptions = subcategories.filter((s) => s.categoryId === value.categoryId);
  const brandOptions = brands.filter((b) => b.subcategoryId === value.subcategoryId);
  const lineOptions = productLines.filter((l) => l.brandId === value.brandId);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <SearchableSelect
        label="Category"
        placeholder="Select category"
        value={value.categoryId}
        options={categories.map((c) => ({ id: c.id, label: c.name }))}
        onChange={(id) => onChange({ categoryId: id })}
        onCreate={(name) => {
          const cat = addCategory(name);
          onChange({ categoryId: cat.id });
        }}
      />
      <SearchableSelect
        label="Sub-category"
        placeholder="Select sub-category"
        disabled={!value.categoryId}
        disabledHint="Select a category first"
        value={value.subcategoryId}
        options={subOptions.map((s) => ({ id: s.id, label: s.name }))}
        onChange={(id) => onChange({ ...value, subcategoryId: id, brandId: undefined, productLineId: undefined })}
        onCreate={
          value.categoryId
            ? (name) => {
                const sub = addSubcategory(name, value.categoryId!);
                onChange({ ...value, subcategoryId: sub.id, brandId: undefined, productLineId: undefined });
              }
            : undefined
        }
      />
      <SearchableSelect
        label="Brand"
        placeholder="Select brand"
        disabled={!value.subcategoryId}
        disabledHint="Select a sub-category first"
        value={value.brandId}
        options={brandOptions.map((b) => ({ id: b.id, label: b.name }))}
        onChange={(id) => onChange({ ...value, brandId: id, productLineId: undefined })}
        onCreate={
          value.subcategoryId
            ? (name) => {
                const brand = addBrand(name, value.subcategoryId!);
                onChange({ ...value, brandId: brand.id, productLineId: undefined });
              }
            : undefined
        }
      />
      <SearchableSelect
        label="Product Line"
        placeholder="Select product line"
        disabled={!value.brandId}
        disabledHint="Select a brand first"
        value={value.productLineId}
        options={lineOptions.map((l) => ({ id: l.id, label: l.name }))}
        onChange={(id) => onChange({ ...value, productLineId: id })}
        onCreate={
          value.brandId
            ? (name) => {
                const line = addProductLine(name, value.brandId!);
                onChange({ ...value, productLineId: line.id });
              }
            : undefined
        }
      />
    </div>
  );
}

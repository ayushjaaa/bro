"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { flavorCountForBrand, flavorCountForLine, flavorCountForSubcategory } from "@/lib/helpers";
import { useStore } from "@/lib/store";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 20 20"
      className={`text-neutral-400 transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
    >
      <path d="M7 5l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Sidebar() {
  const router = useRouter();
  const { categories, subcategories, brands, productLines, flavors, selectedContext, setSelectedContext } =
    useStore();

  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());
  const [openBrands, setOpenBrands] = useState<Set<string>>(new Set());

  function toggle(set: Set<string>, setFn: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFn(next);
  }

  function selectLine(lineId: string, brandId: string, subcategoryId: string, categoryId: string) {
    setSelectedContext({ categoryId, subcategoryId, brandId, productLineId: lineId });
    router.push("/bulk-add");
  }

  return (
    <aside className="w-64 shrink-0 border-r border-neutral-200 bg-neutral-50/60 h-full overflow-y-auto py-3">
      <div className="px-3 pb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Catalog</span>
        <button
          onClick={() => setSelectedContext({})}
          className="text-[11px] text-emerald-700 hover:underline"
        >
          Clear
        </button>
      </div>
      <ul className="text-sm">
        {categories.map((cat) => {
          const catOpen = openCats.has(cat.id);
          const catSubs = subcategories.filter((s) => s.categoryId === cat.id);
          const isCatSelected = selectedContext.categoryId === cat.id && !selectedContext.subcategoryId;
          return (
            <li key={cat.id}>
              <div
                className={`flex items-center gap-1 px-3 py-1.5 cursor-pointer hover:bg-neutral-100 ${
                  isCatSelected ? "bg-emerald-50 text-emerald-800 font-medium" : "text-neutral-800"
                }`}
                onClick={() => {
                  toggle(openCats, setOpenCats, cat.id);
                  setSelectedContext({ categoryId: cat.id });
                }}
              >
                <Chevron open={catOpen} />
                <span className="truncate">{cat.name}</span>
              </div>
              {catOpen && (
                <ul className="ml-4 border-l border-neutral-200">
                  {catSubs.map((sub) => {
                    const subOpen = openSubs.has(sub.id);
                    const subBrands = brands.filter((b) => b.subcategoryId === sub.id);
                    const subCount = flavorCountForSubcategory(flavors, productLines, brands, sub.id);
                    const isSubSelected = selectedContext.subcategoryId === sub.id && !selectedContext.brandId;
                    return (
                      <li key={sub.id}>
                        <div
                          className={`flex items-center gap-1 px-3 py-1.5 cursor-pointer hover:bg-neutral-100 ${
                            isSubSelected ? "bg-emerald-50 text-emerald-800 font-medium" : "text-neutral-700"
                          }`}
                          onClick={() => {
                            toggle(openSubs, setOpenSubs, sub.id);
                            setSelectedContext({ categoryId: cat.id, subcategoryId: sub.id });
                          }}
                        >
                          <Chevron open={subOpen} />
                          <span className="truncate flex-1">{sub.name}</span>
                          <span className="text-[11px] text-neutral-400">{subCount}</span>
                        </div>
                        {subOpen && (
                          <ul className="ml-4 border-l border-neutral-200">
                            {subBrands.map((brand) => {
                              const brandOpen = openBrands.has(brand.id);
                              const brandLines = productLines.filter((l) => l.brandId === brand.id);
                              const brandCount = flavorCountForBrand(flavors, productLines, brand.id);
                              const isBrandSelected =
                                selectedContext.brandId === brand.id && !selectedContext.productLineId;
                              return (
                                <li key={brand.id}>
                                  <div
                                    className={`flex items-center gap-1 px-3 py-1.5 cursor-pointer hover:bg-neutral-100 ${
                                      isBrandSelected ? "bg-emerald-50 text-emerald-800 font-medium" : "text-neutral-700"
                                    }`}
                                    onClick={() => {
                                      toggle(openBrands, setOpenBrands, brand.id);
                                      setSelectedContext({
                                        categoryId: cat.id,
                                        subcategoryId: sub.id,
                                        brandId: brand.id,
                                      });
                                    }}
                                  >
                                    <Chevron open={brandOpen} />
                                    <span className="truncate flex-1">{brand.name}</span>
                                    <span className="text-[11px] text-neutral-400">{brandCount}</span>
                                  </div>
                                  {brandOpen && (
                                    <ul className="ml-4 border-l border-neutral-200">
                                      {brandLines.map((line) => {
                                        const lineCount = flavorCountForLine(flavors, line.id);
                                        const isLineSelected = selectedContext.productLineId === line.id;
                                        return (
                                          <li key={line.id}>
                                            <div
                                              className={`flex items-center gap-1 px-3 py-1.5 cursor-pointer hover:bg-neutral-100 ${
                                                isLineSelected
                                                  ? "bg-emerald-100 text-emerald-800 font-medium"
                                                  : "text-neutral-600"
                                              }`}
                                              onClick={() => selectLine(line.id, brand.id, sub.id, cat.id)}
                                            >
                                              <span className="w-3" />
                                              <span className="truncate flex-1">{line.name}</span>
                                              <span className="text-[11px] text-neutral-400">{lineCount}</span>
                                            </div>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

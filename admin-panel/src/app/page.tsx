"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import {
  breadcrumbFor,
  flavorCountForBrand,
  flavorCountForCategory,
  flavorCountForLine,
  flavorCountForSubcategory,
} from "@/lib/helpers";

export default function OverviewPage() {
  const router = useRouter();
  const {
    categories,
    subcategories,
    brands,
    productLines,
    flavors,
    selectedContext,
    setSelectedContext,
  } = useStore();

  const breadcrumb = breadcrumbFor(selectedContext, categories, subcategories, brands, productLines);

  const rows = useMemo(() => {
    if (selectedContext.brandId) {
      // show product lines within brand
      return productLines
        .filter((l) => l.brandId === selectedContext.brandId)
        .map((l) => ({
          id: l.id,
          name: l.name,
          count: flavorCountForLine(flavors, l.id),
          kind: "Product Line" as const,
          onOpen: () =>
            router.push("/bulk-add"),
          onOpenCtx: () =>
            setSelectedContext({ ...selectedContext, productLineId: l.id }),
        }));
    }
    if (selectedContext.subcategoryId) {
      return brands
        .filter((b) => b.subcategoryId === selectedContext.subcategoryId)
        .map((b) => ({
          id: b.id,
          name: b.name,
          count: flavorCountForBrand(flavors, productLines, b.id),
          kind: "Brand" as const,
          onOpenCtx: () => setSelectedContext({ ...selectedContext, brandId: b.id }),
        }));
    }
    if (selectedContext.categoryId) {
      return subcategories
        .filter((s) => s.categoryId === selectedContext.categoryId)
        .map((s) => ({
          id: s.id,
          name: s.name,
          count: flavorCountForSubcategory(flavors, productLines, brands, s.id),
          kind: "Sub-category" as const,
          onOpenCtx: () => setSelectedContext({ ...selectedContext, subcategoryId: s.id }),
        }));
    }
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      count: flavorCountForCategory(flavors, productLines, brands, subcategories, c.id),
      kind: "Category" as const,
      onOpenCtx: () => setSelectedContext({ categoryId: c.id }),
    }));
  }, [selectedContext, categories, subcategories, brands, productLines, flavors, router, setSelectedContext]);

  return (
    <div className="max-w-5xl mx-auto p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {breadcrumb.length > 0 ? (
              <span className="flex items-center gap-1 flex-wrap">
                <button onClick={() => setSelectedContext({})} className="text-emerald-700 hover:underline">
                  All
                </button>
                {breadcrumb.map((b, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="text-neutral-300">/</span>
                    <span>{b}</span>
                  </span>
                ))}
              </span>
            ) : (
              "Every category, sub-category, brand and product line at a glance."
            )}
          </p>
        </div>
        <Link
          href="/flavors/new"
          className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 transition"
        >
          + Add Flavor
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Categories", value: categories.length },
          { label: "Sub-categories", value: subcategories.length },
          { label: "Brands", value: brands.length },
          { label: "Product Lines", value: productLines.length },
          { label: "Flavors", value: flavors.length },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="text-2xl font-semibold text-neutral-900">{stat.value}</div>
            <div className="text-xs text-neutral-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 text-sm font-medium text-neutral-700">
          {selectedContext.brandId
            ? "Product lines"
            : selectedContext.subcategoryId
            ? "Brands"
            : selectedContext.categoryId
            ? "Sub-categories"
            : "Categories"}
        </div>
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="border-b border-neutral-50 last:border-0">
              <button
                onClick={r.onOpenCtx}
                className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-50 text-left"
              >
                <span className="font-medium text-neutral-800">{r.name}</span>
                <span className="text-neutral-400">{r.count} flavor{r.count === 1 ? "" : "s"}</span>
              </button>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-4 py-6 text-sm text-neutral-400 text-center">Nothing here yet.</li>
          )}
        </ul>
      </div>

      {selectedContext.productLineId && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-center justify-between">
          <div className="text-sm text-emerald-800">
            <strong>{breadcrumb[breadcrumb.length - 1]}</strong> selected — add flavors directly into it.
          </div>
          <div className="flex gap-2">
            <Link
              href="/flavors/new"
              className="rounded-md bg-white border border-emerald-300 text-emerald-700 text-sm font-medium px-3 py-1.5 hover:bg-emerald-100"
            >
              Add one flavor
            </Link>
            <Link
              href="/bulk-add"
              className="rounded-md bg-emerald-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-emerald-700"
            >
              Add multiple (bulk list)
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

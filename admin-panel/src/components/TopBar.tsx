"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useRef, useState, useEffect } from "react";
import { useStore } from "@/lib/store";

type Hit = { type: "Flavor" | "Brand" | "Product Line" | "Category"; label: string; sublabel?: string; go: () => void };

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { flavors, brands, productLines, categories, subcategories, setSelectedContext } = useStore();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const hits: Hit[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: Hit[] = [];

    for (const f of flavors) {
      if (f.name.toLowerCase().includes(q)) {
        const line = productLines.find((l) => l.id === f.productLineId);
        const brand = brands.find((b) => b.id === line?.brandId);
        results.push({
          type: "Flavor",
          label: f.name,
          sublabel: brand ? `${brand.name}${line ? " · " + line.name : ""}` : undefined,
          go: () => {
            if (line && brand) {
              const sub = subcategories.find((s) => s.id === brand.subcategoryId);
              setSelectedContext({
                categoryId: sub?.categoryId,
                subcategoryId: brand.subcategoryId,
                brandId: brand.id,
                productLineId: line.id,
              });
            }
            router.push("/bulk-add");
          },
        });
      }
      if (results.length >= 8) break;
    }
    for (const b of brands) {
      if (b.name.toLowerCase().includes(q)) {
        results.push({
          type: "Brand",
          label: b.name,
          go: () => {
            const sub = subcategories.find((s) => s.id === b.subcategoryId);
            setSelectedContext({ categoryId: sub?.categoryId, subcategoryId: b.subcategoryId, brandId: b.id });
            router.push("/");
          },
        });
      }
    }
    for (const l of productLines) {
      if (l.name.toLowerCase().includes(q)) {
        const brand = brands.find((b) => b.id === l.brandId);
        results.push({
          type: "Product Line",
          label: l.name,
          sublabel: brand?.name,
          go: () => {
            const sub = subcategories.find((s) => s.id === brand?.subcategoryId);
            setSelectedContext({
              categoryId: sub?.categoryId,
              subcategoryId: brand?.subcategoryId,
              brandId: brand?.id,
              productLineId: l.id,
            });
            router.push("/bulk-add");
          },
        });
      }
    }
    for (const c of categories) {
      if (c.name.toLowerCase().includes(q)) {
        results.push({
          type: "Category",
          label: c.name,
          go: () => {
            setSelectedContext({ categoryId: c.id });
            router.push("/");
          },
        });
      }
    }
    return results.slice(0, 12);
  }, [query, flavors, brands, productLines, categories, subcategories, router, setSelectedContext]);

  const navLink = (href: string, label: string) => (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
        pathname === href ? "bg-emerald-600 text-white" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="h-14 shrink-0 border-b border-neutral-200 bg-white flex items-center gap-4 px-4">
      <Link href="/" className="font-semibold text-neutral-900 text-sm shrink-0">
        🧃 Flavor Admin
      </Link>

      <nav className="flex items-center gap-1 shrink-0">
        {navLink("/", "Overview")}
        {navLink("/flavors/new", "Add Flavor")}
        {navLink("/bulk-add", "Bulk Add")}
      </nav>

      <div className="flex-1 flex justify-end">
        <div className="relative w-full max-w-sm" ref={rootRef}>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search any flavor, brand, or line..."
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
          />
          {open && query.trim() && (
            <div className="absolute right-0 z-40 mt-1 w-96 max-h-80 overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg">
              {hits.length === 0 && <div className="px-3 py-3 text-sm text-neutral-400">No matches</div>}
              {hits.map((h, i) => (
                <button
                  key={i}
                  onClick={() => {
                    h.go();
                    setQuery("");
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    {h.label}
                    {h.sublabel && <span className="text-neutral-400 ml-1.5 text-xs">{h.sublabel}</span>}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-400 bg-neutral-100 rounded px-1.5 py-0.5">
                    {h.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

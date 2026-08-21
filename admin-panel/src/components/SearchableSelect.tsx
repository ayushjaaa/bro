"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SelectOption = { id: string; label: string; sublabel?: string };

export default function SearchableSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  onCreate,
  disabled,
  disabledHint,
}: {
  label: string;
  placeholder: string;
  options: SelectOption[];
  value: string | undefined;
  onChange: (id: string) => void;
  onCreate?: (name: string) => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel ?? "").toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const exactMatch = options.some(
    (o) => o.label.toLowerCase() === query.trim().toLowerCase()
  );

  return (
    <div className="flex flex-col gap-1.5" ref={rootRef}>
      <label className="text-[13px] font-medium text-neutral-700">{label}</label>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm text-left transition ${
            disabled
              ? "border-neutral-200 bg-neutral-50 text-neutral-400 cursor-not-allowed"
              : "border-neutral-300 bg-white hover:border-neutral-400"
          }`}
        >
          <span className={selected ? "text-neutral-900" : "text-neutral-400"}>
            {selected ? selected.label : disabled ? disabledHint ?? placeholder : placeholder}
          </span>
          <svg width="14" height="14" viewBox="0 0 20 20" className="text-neutral-400 shrink-0">
            <path d="M5 7l5 6 5-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && !disabled && (
          <div className="absolute z-30 mt-1 w-full rounded-md border border-neutral-200 bg-white shadow-lg">
            <div className="p-2 border-b border-neutral-100">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to search..."
                className="w-full rounded border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <div className="px-3 py-2 text-sm text-neutral-400">No matches</div>
              )}
              {filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    onChange(o.id);
                    setQuery("");
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 ${
                    o.id === value ? "bg-emerald-50 text-emerald-700 font-medium" : "text-neutral-700"
                  }`}
                >
                  {o.label}
                  {o.sublabel && <span className="text-neutral-400 ml-1.5 text-xs">{o.sublabel}</span>}
                </button>
              ))}
            </div>
            {onCreate && query.trim() && !exactMatch && (
              <button
                type="button"
                onClick={() => {
                  onCreate(query.trim());
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 border-t border-neutral-100 font-medium"
              >
                + Add “{query.trim()}”
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

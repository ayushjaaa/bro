"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import TaxonomyPicker from "@/components/TaxonomyPicker";
import ImageSlots from "@/components/ImageSlots";

const STRENGTHS = ["0mg", "3mg", "6mg", "12mg", "20mg", "35mg", "50mg"];

export default function AddFlavorPage() {
  const router = useRouter();
  const { selectedContext, setSelectedContext, addFlavor, productLines } = useStore();

  const [ctx, setCtx] = useState(selectedContext);
  const [name, setName] = useState("");
  const [images, setImages] = useState<(string | null)[]>([null, null, null, null]);
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [strength, setStrength] = useState("");
  const [puffCount, setPuffCount] = useState("");
  const [savedName, setSavedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const productLineName = productLines.find((l) => l.id === ctx.productLineId)?.name;

  function handleSubmit(createAnother: boolean) {
    setError(null);
    if (!name.trim()) return setError("Flavor name is required.");
    if (!ctx.productLineId) return setError("Select the full taxonomy chain, including a product line.");
    if (!price.trim()) return setError("Price is required.");

    addFlavor({
      name: name.trim(),
      productLineId: ctx.productLineId,
      images,
      price: price.trim(),
      description: description.trim(),
      nicotineStrength: strength,
      puffCount,
    });

    setSelectedContext(ctx);
    setSavedName(name.trim());

    if (createAnother) {
      setName("");
      setImages([null, null, null, null]);
      setPrice("");
      setDescription("");
      setStrength("");
      setPuffCount("");
    } else {
      router.push("/");
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Add flavor</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          One flavor = one product. Fill this in like Shopify&apos;s own Add product screen.
        </p>
      </div>

      {savedName && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          ✓ “{savedName}” created. {productLineName && <>Still adding into <strong>{productLineName}</strong>.</>}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white p-5 flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-neutral-700">Taxonomy</h2>
          <TaxonomyPicker value={ctx} onChange={setCtx} />
        </section>

        <hr className="border-neutral-100" />

        <section className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-neutral-700">Flavor name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mango Peach Ice"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </section>

        <section className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-neutral-700">Images (4 slots)</label>
          <ImageSlots images={images} onChange={setImages} />
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <section className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-neutral-700">Price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="19.99"
                inputMode="decimal"
                className="w-full rounded-md border border-neutral-300 pl-6 pr-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </div>
          </section>
          <section className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-neutral-700">Nicotine strength</label>
            <select
              value={strength}
              onChange={(e) => setStrength(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 bg-white"
            >
              <option value="">Select strength</option>
              {STRENGTHS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </section>
          <section className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-neutral-700">Puff count</label>
            <input
              value={puffCount}
              onChange={(e) => setPuffCount(e.target.value)}
              placeholder="e.g. 6000 (leave blank for e-liquids)"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </section>
        </div>

        <section className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-neutral-700">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Flavor notes, ingredients, anything customers should know..."
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </section>
      </div>

      <div className="flex items-center justify-end gap-2 mt-4">
        <button
          onClick={() => handleSubmit(true)}
          className="rounded-md border border-neutral-300 bg-white text-neutral-700 text-sm font-medium px-4 py-2 hover:bg-neutral-50"
        >
          Save &amp; add another
        </button>
        <button
          onClick={() => handleSubmit(false)}
          className="rounded-md bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700"
        >
          Save flavor
        </button>
      </div>
    </div>
  );
}

"use client";

export default function ImageSlots({
  images,
  onChange,
  compact,
}: {
  images: (string | null)[];
  onChange: (images: (string | null)[]) => void;
  compact?: boolean;
}) {
  function handleFile(index: number, file: File | null) {
    if (!file) {
      const next = [...images];
      next[index] = null;
      onChange(next);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const next = [...images];
      next[index] = reader.result as string;
      onChange(next);
    };
    reader.readAsDataURL(file);
  }

  const size = compact ? "w-16 h-16" : "w-24 h-24";

  return (
    <div className="flex gap-2">
      {images.map((img, i) => (
        <label
          key={i}
          className={`${size} relative shrink-0 rounded-md border-2 border-dashed flex items-center justify-center cursor-pointer overflow-hidden transition ${
            img ? "border-emerald-300 bg-emerald-50" : "border-neutral-300 bg-neutral-50 hover:border-emerald-400"
          }`}
          title={`Image slot ${i + 1}`}
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(i, e.target.files?.[0] ?? null)}
          />
          {img ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt={`slot ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleFile(i, null);
                }}
                className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] leading-none"
              >
                ✕
              </button>
            </>
          ) : (
            <span className="text-neutral-400 text-xs flex flex-col items-center gap-0.5">
              <span className="text-lg leading-none">+</span>
              {!compact && <span>{i + 1}</span>}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}

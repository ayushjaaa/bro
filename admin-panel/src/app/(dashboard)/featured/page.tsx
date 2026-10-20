import Link from 'next/link';
import {
  listFeaturedProducts,
  FEATURED_COLLECTION_KEYS,
  FEATURED_TITLES,
  HOMEPAGE_SLOTS,
} from '@/data/featured-collections';

export default async function FeaturedPage() {
  const lists = await Promise.all(FEATURED_COLLECTION_KEYS.map((key) => listFeaturedProducts(key)));

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">Featured</h1>
        <p className="text-sm text-neutral-500">
          The storefront homepage&apos;s &quot;Featured Brands&quot; tabs. Each collection can hold any
          number of products: its latest {HOMEPAGE_SLOTS} show on the homepage tab, and the whole
          collection shows on that tab&apos;s &quot;View all&quot; page. Open a collection to manage it.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FEATURED_COLLECTION_KEYS.map((key, i) => {
          const onHomepage = lists[i].filter((p) => p.isPublished).slice(0, HOMEPAGE_SLOTS);
          return (
            <Link
              key={key}
              href={`/featured/${key}`}
              className="rounded-lg border border-neutral-200 bg-white p-4 flex flex-col gap-3 hover:border-neutral-400"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-700">
                  {FEATURED_TITLES[key]}{' '}
                  <span className="text-neutral-400 font-normal">({lists[i].length} products)</span>
                </h2>
                <span className="text-xs font-medium text-neutral-600">Manage &rarr;</span>
              </div>
              {onHomepage.length === 0 ? (
                <p className="text-sm text-neutral-400">Nothing on the homepage tab yet.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-neutral-500">On homepage now:</p>
                  {onHomepage.map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="w-6 h-6 rounded object-cover border border-neutral-200" />
                      ) : (
                        <div className="w-6 h-6 rounded bg-neutral-100 border border-neutral-200" />
                      )}
                      <span className="truncate text-sm text-neutral-800">{p.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

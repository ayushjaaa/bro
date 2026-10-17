import { listFeaturedProducts } from '@/data/featured-collections';
import FeaturedSectionManager from '@/features/featured/components/FeaturedSectionManager';

export default async function FeaturedPage() {
  const [trending, promotions] = await Promise.all([
    listFeaturedProducts('trending'),
    listFeaturedProducts('promotions'),
  ]);

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">Featured</h1>
        <p className="text-sm text-neutral-500">
          Controls the storefront homepage&apos;s &quot;Featured Brands&quot; Trending and
          Promotions tabs. Best Sellers and New Arrivals are automatic (sales/new-arrival order)
          and aren&apos;t managed here.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FeaturedSectionManager collectionKey="trending" title="Trending" initial={trending} />
        <FeaturedSectionManager collectionKey="promotions" title="Promotions" initial={promotions} />
      </div>
    </div>
  );
}

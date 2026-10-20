import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  listFeaturedProducts,
  isFeaturedCollectionKey,
  FEATURED_TITLES,
  HOMEPAGE_SLOTS,
} from '@/data/featured-collections';
import FeaturedSectionManager from '@/features/featured/components/FeaturedSectionManager';

export default async function FeaturedCollectionPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isFeaturedCollectionKey(key)) notFound();

  const products = await listFeaturedProducts(key);
  const title = FEATURED_TITLES[key];

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/featured" className="text-xs text-neutral-500 hover:underline">
            &larr; Featured
          </Link>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-neutral-500">
            Newly added products go to the top. The latest {HOMEPAGE_SLOTS} published products show on
            the homepage&apos;s {title} tab (marked &quot;On homepage&quot;); every product here shows on
            the {title} &quot;View all&quot; page. Use the arrows to change the order. Changes can take up
            to 5 minutes to show on the storefront.
          </p>
        </div>
        <Link
          href={`/products/new?featured=${key}`}
          className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          + Create new product
        </Link>
      </div>
      <FeaturedSectionManager collectionKey={key} title={title} initial={products} homepageSlots={HOMEPAGE_SLOTS} />
    </div>
  );
}

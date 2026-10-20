import { listCategories, listSubcategories, listBrands } from '@/data/taxonomy';
import { listFilterDefinitions, listSubcategoryFilterLinks } from '@/data/filters';
import ProductLineForm from '@/features/products/components/ProductLineForm';
import { isFeaturedCollectionKey, FEATURED_TITLES } from '@/data/featured-collections';

export default async function AddProductPage({ searchParams }: { searchParams: Promise<{ featured?: string }> }) {
  const { featured } = await searchParams;
  const featuredKey = featured && isFeaturedCollectionKey(featured) ? featured : undefined;

  const [categories, subcategories, brands, filterDefinitions, subcategoryFilterLinks] =
    await Promise.all([
      listCategories(),
      listSubcategories(),
      listBrands(),
      listFilterDefinitions(),
      listSubcategoryFilterLinks(),
    ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Add Product Line</h1>
      {featuredKey && (
        <p className="text-sm text-neutral-500">
          Will also be added to the top of <strong>{FEATURED_TITLES[featuredKey]}</strong>. It shows on the
          storefront once you add flavours and publish it.
        </p>
      )}
      <ProductLineForm
        categories={categories}
        subcategories={subcategories}
        brands={brands}
        filterDefinitions={filterDefinitions}
        subcategoryFilterLinks={subcategoryFilterLinks}
        featuredKey={featuredKey}
      />
    </div>
  );
}

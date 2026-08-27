import { listCategories, listSubcategories, listBrands } from '@/data/taxonomy';
import { listFilterDefinitions, listSubcategoryFilterLinks } from '@/data/filters';
import ProductLineForm from '@/features/products/components/ProductLineForm';

export default async function AddProductPage() {
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
      <ProductLineForm
        categories={categories}
        subcategories={subcategories}
        brands={brands}
        filterDefinitions={filterDefinitions}
        subcategoryFilterLinks={subcategoryFilterLinks}
      />
    </div>
  );
}

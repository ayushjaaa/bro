import { listCategories, listSubcategories, listBrands } from '@/data/taxonomy';
import TaxonomyTree from '@/features/taxonomy/components/TaxonomyTree';

export default async function TaxonomyPage() {
  const [categories, subcategories, brands] = await Promise.all([
    listCategories(),
    listSubcategories(),
    listBrands(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Taxonomy</h1>
      <TaxonomyTree categories={categories} subcategories={subcategories} brands={brands} />
    </div>
  );
}

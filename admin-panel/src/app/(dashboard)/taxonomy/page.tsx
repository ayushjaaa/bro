import { listCategories, listSubcategories, listBrands } from '@/data/taxonomy';
import { listFilterDefinitions, listSubcategoryFilterLinks } from '@/data/filters';
import TaxonomyTree from '@/features/taxonomy/components/TaxonomyTree';

export default async function TaxonomyPage() {
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
      <h1 className="text-xl font-semibold">Taxonomy</h1>
      <TaxonomyTree
        categories={categories}
        subcategories={subcategories}
        brands={brands}
        filterDefinitions={filterDefinitions}
        subcategoryFilterLinks={subcategoryFilterLinks}
      />
    </div>
  );
}

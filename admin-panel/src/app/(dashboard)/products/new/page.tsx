import { listCategories, listSubcategories, listBrands } from '@/data/taxonomy';
import ProductForm from '@/features/products/components/ProductForm';

export default async function AddProductPage() {
  const [categories, allSubcategories, allBrands] = await Promise.all([
    listCategories(),
    listSubcategories(),
    listBrands(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">Add Product</h1>
      <ProductForm
        categories={categories}
        allSubcategories={allSubcategories}
        allBrands={allBrands}
      />
    </div>
  );
}

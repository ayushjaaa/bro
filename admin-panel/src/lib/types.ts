export type Category = {
  id: string;
  name: string;
};

export type Subcategory = {
  id: string;
  name: string;
  categoryId: string;
};

export type Brand = {
  id: string;
  name: string;
  subcategoryId: string;
};

export type ProductLine = {
  id: string;
  name: string;
  brandId: string;
};

export type Flavor = {
  id: string;
  name: string;
  productLineId: string;
  images: (string | null)[]; // fixed 4 slots
  price: string;
  description: string;
  nicotineStrength: string;
  puffCount: string;
  createdAt: string;
};

export type TaxonomyContext = {
  categoryId?: string;
  subcategoryId?: string;
  brandId?: string;
  productLineId?: string;
};

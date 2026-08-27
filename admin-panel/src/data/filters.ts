import 'server-only';
import { shopifyAdminRequest, assertNoUserErrors } from '@/lib/shopify/admin-client';
import { requireAdmin } from './admin-auth';

/**
 * Filter-system DAL (ADMIN_PANEL_IMPLEMENTATION.md §7). A FilterDefinition is a metaobject
 * describing one storefront filter (e.g. "Material" for Rolling Papers). For `level: 'product'`
 * or `'variant'`, a matching Shopify metafieldDefinition (namespace `custom`, key = the same
 * domain-prefixed key) is created in the SAME call, so the metaobject record and the actual
 * Shopify metafield can never go out of sync (§7.1).
 */

export type FilterLevel = 'native' | 'product' | 'variant';
export type NativeField = 'price' | 'availability' | 'brand' | 'flavor';

export type FilterDefinition = {
  id: string;
  label: string;
  key: string;
  level: FilterLevel;
  choices: string[];
  nativeField: NativeField | null;
  /** Whether every Product Line this filter applies to must have a value set for it -- powers
   * the Dashboard's "missing required filter" warning. Defaults to false for existing filters
   * (set via `npm run shopify:set-filter-required`, no admin-UI toggle built for this yet). */
  required: boolean;
};

interface MetaobjectField {
  key: string;
  value: string | null;
}

interface FilterDefinitionsResponse {
  metaobjects: { nodes: Array<{ id: string; fields: MetaobjectField[] }> };
}

const LIST_FILTER_DEFINITIONS_QUERY = /* GraphQL */ `
  query ListFilterDefinitions {
    metaobjects(type: "filter_definition", first: 250) {
      nodes {
        id
        fields {
          key
          value
        }
      }
    }
  }
`;

function fieldValue(fields: MetaobjectField[], key: string): string | null {
  return fields.find((f) => f.key === key)?.value ?? null;
}

function toFilterDefinition(id: string, fields: MetaobjectField[]): FilterDefinition {
  const choicesRaw = fieldValue(fields, 'choices');
  return {
    id,
    label: fieldValue(fields, 'label') ?? '',
    key: fieldValue(fields, 'key') ?? '',
    level: (fieldValue(fields, 'level') as FilterLevel | null) ?? 'product',
    choices: choicesRaw ? (JSON.parse(choicesRaw) as string[]) : [],
    nativeField: fieldValue(fields, 'native_field') as NativeField | null,
    required: fieldValue(fields, 'required') === 'true',
  };
}

export async function listFilterDefinitions(): Promise<FilterDefinition[]> {
  await requireAdmin();
  const data = await shopifyAdminRequest<FilterDefinitionsResponse>(LIST_FILTER_DEFINITIONS_QUERY);
  return data.metaobjects.nodes.map((n) => toFilterDefinition(n.id, n.fields));
}

interface SubcategoryFilterLinksResponse {
  metaobjects: { nodes: Array<{ id: string; field: { value: string | null } | null }> };
}

const LIST_SUBCATEGORY_FILTER_LINKS_QUERY = /* GraphQL */ `
  query ListSubcategoryFilterLinks {
    metaobjects(type: "sub_category", first: 250) {
      nodes {
        id
        field(key: "relevant_filters") {
          value
        }
      }
    }
  }
`;

/** Maps each Sub-category id -> the FilterDefinition ids attached to it (§7.2 reads this to
 * decide which fields the Product-form should render for the selected Sub-category). */
export async function listSubcategoryFilterLinks(): Promise<Record<string, string[]>> {
  await requireAdmin();
  const data = await shopifyAdminRequest<SubcategoryFilterLinksResponse>(
    LIST_SUBCATEGORY_FILTER_LINKS_QUERY
  );
  const links: Record<string, string[]> = {};
  for (const node of data.metaobjects.nodes) {
    links[node.id] = node.field?.value ? JSON.parse(node.field.value) : [];
  }
  return links;
}

// ---------------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------------

const METAOBJECT_CREATE_MUTATION = /* GraphQL */ `
  mutation MetaobjectCreate($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const METAFIELD_DEFINITION_CREATE_MUTATION = /* GraphQL */ `
  mutation MetafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

async function createMetafieldDefinitionForFilter(input: {
  key: string;
  label: string;
  level: 'product' | 'variant';
  choices: string[];
}): Promise<void> {
  const ownerType = input.level === 'product' ? 'PRODUCT' : 'PRODUCTVARIANT';
  const data = await shopifyAdminRequest<any>(METAFIELD_DEFINITION_CREATE_MUTATION, {
    definition: {
      name: input.label,
      namespace: 'custom',
      key: input.key,
      type: 'single_line_text_field',
      ownerType,
      validations: [{ name: 'choices', value: JSON.stringify(input.choices) }],
      access: { storefront: 'PUBLIC_READ' },
    },
  });
  assertNoUserErrors(
    data.metafieldDefinitionCreate.userErrors,
    `metafieldDefinitionCreate(custom.${input.key} on ${ownerType})`
  );
}

/**
 * Creates a FilterDefinition metaobject and, for `level: 'product' | 'variant'`, the matching
 * `custom.<key>` metafield definition in the same call (§7.1 — these must never go out of sync).
 * `level: 'native'` (Price/Availability/Brand/Flavor) needs no metafield at all.
 */
export async function createFilterDefinition(input: {
  label: string;
  key: string;
  level: FilterLevel;
  choices?: string[];
  nativeField?: NativeField;
}): Promise<FilterDefinition> {
  await requireAdmin();

  if (input.level === 'native') {
    if (!input.nativeField) throw new Error('nativeField is required when level is "native"');
  } else if (!input.choices || input.choices.length === 0) {
    throw new Error('choices is required when level is "product" or "variant"');
  }

  if (input.level === 'product' || input.level === 'variant') {
    await createMetafieldDefinitionForFilter({
      key: input.key,
      label: input.label,
      level: input.level,
      choices: input.choices!,
    });
  }

  const fields = [
    { key: 'label', value: input.label },
    { key: 'key', value: input.key },
    { key: 'level', value: input.level },
  ];
  if (input.choices) fields.push({ key: 'choices', value: JSON.stringify(input.choices) });
  if (input.nativeField) fields.push({ key: 'native_field', value: input.nativeField });

  const data = await shopifyAdminRequest<any>(METAOBJECT_CREATE_MUTATION, {
    metaobject: { type: 'filter_definition', fields },
  });
  assertNoUserErrors(data.metaobjectCreate.userErrors, 'metaobjectCreate(filter_definition)');
  const id = data.metaobjectCreate.metaobject.id as string;

  return {
    id,
    label: input.label,
    key: input.key,
    level: input.level,
    choices: input.choices ?? [],
    nativeField: input.nativeField ?? null,
    required: false,
  };
}

// ---------------------------------------------------------------------------------------------
// Attach a FilterDefinition to a Sub-category's `relevant_filters` list
// ---------------------------------------------------------------------------------------------

interface SubcategoryFiltersResponse {
  metaobject: { id: string; field: { value: string | null } | null } | null;
}

const GET_SUBCATEGORY_RELEVANT_FILTERS_QUERY = /* GraphQL */ `
  query GetSubcategoryRelevantFilters($id: ID!) {
    metaobject(id: $id) {
      id
      field(key: "relevant_filters") {
        value
      }
    }
  }
`;

const METAOBJECT_UPDATE_MUTATION = /* GraphQL */ `
  mutation MetaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** Appends a FilterDefinition to a Sub-category's relevant_filters list (no-op if already present). */
export async function attachFilterToSubcategory(
  subcategoryId: string,
  filterDefinitionId: string
): Promise<void> {
  await requireAdmin();

  const current = await shopifyAdminRequest<SubcategoryFiltersResponse>(
    GET_SUBCATEGORY_RELEVANT_FILTERS_QUERY,
    { id: subcategoryId }
  );
  const existingIds: string[] = current.metaobject?.field?.value
    ? JSON.parse(current.metaobject.field.value)
    : [];

  if (existingIds.includes(filterDefinitionId)) return;

  const data = await shopifyAdminRequest<any>(METAOBJECT_UPDATE_MUTATION, {
    id: subcategoryId,
    metaobject: {
      fields: [
        { key: 'relevant_filters', value: JSON.stringify([...existingIds, filterDefinitionId]) },
      ],
    },
  });
  assertNoUserErrors(data.metaobjectUpdate.userErrors, 'metaobjectUpdate(sub_category.relevant_filters)');
}

// ---------------------------------------------------------------------------------------------
// Add a Choice value to an existing FilterDefinition -- ADD ONLY, never delete/edit an existing
// value (§7.4 rule 6): removing an in-use choice could invalidate data on existing products.
// ---------------------------------------------------------------------------------------------

interface FilterDefinitionByIdResponse {
  metaobject: { id: string; fields: MetaobjectField[] } | null;
}

const GET_FILTER_DEFINITION_QUERY = /* GraphQL */ `
  query($id: ID!) {
    metaobject(id: $id) {
      id
      fields { key value }
    }
  }
`;

const FIND_METAFIELD_DEFINITION_QUERY = /* GraphQL */ `
  query($key: String!, $ownerType: MetafieldOwnerType!) {
    metafieldDefinitions(namespace: "custom", key: $key, ownerType: $ownerType, first: 1) {
      nodes { id }
    }
  }
`;

const METAFIELD_DEFINITION_UPDATE_MUTATION = /* GraphQL */ `
  mutation Update($definition: MetafieldDefinitionUpdateInput!) {
    metafieldDefinitionUpdate(definition: $definition) {
      updatedDefinition { id }
      userErrors { field message }
    }
  }
`;

/**
 * Appends one new Choice value to an existing FilterDefinition. Order matters (§7.4 rule 3):
 * updates Shopify's actually-enforced `metafieldDefinition` FIRST, then the `filter_definition`
 * metaobject (our display copy) second -- so a partial failure never leaves the Product-form
 * offering a value Shopify would then reject; worst case the display is just briefly stale.
 * Case-insensitive/trimmed dedup (§7.4 rule 4) prevents "Hemp" and "hemp" both existing.
 */
export async function addChoiceToFilter(
  filterDefinitionId: string,
  newChoice: string
): Promise<FilterDefinition> {
  await requireAdmin();

  const trimmed = newChoice.trim();
  if (!trimmed) throw new Error('Choice value cannot be empty');

  const current = await shopifyAdminRequest<FilterDefinitionByIdResponse>(GET_FILTER_DEFINITION_QUERY, {
    id: filterDefinitionId,
  });
  if (!current.metaobject) throw new Error('Filter not found');
  const definition = toFilterDefinition(current.metaobject.id, current.metaobject.fields);

  if (definition.level === 'native') {
    throw new Error('Native filters have no metafield/choices to edit');
  }
  if (definition.choices.some((c) => c.trim().toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`"${trimmed}" already exists in this filter's choices`);
  }

  const updatedChoices = [...definition.choices, trimmed];
  const ownerType = definition.level === 'product' ? 'PRODUCT' : 'PRODUCTVARIANT';

  const mfDef = await shopifyAdminRequest<any>(FIND_METAFIELD_DEFINITION_QUERY, {
    key: definition.key,
    ownerType,
  });
  const mfId = mfDef.metafieldDefinitions.nodes[0]?.id;
  if (!mfId) throw new Error(`metafieldDefinition custom.${definition.key} not found`);

  const mfUpdate = await shopifyAdminRequest<any>(METAFIELD_DEFINITION_UPDATE_MUTATION, {
    definition: {
      key: definition.key,
      namespace: 'custom',
      ownerType,
      validations: [{ name: 'choices', value: JSON.stringify(updatedChoices) }],
    },
  });
  assertNoUserErrors(
    mfUpdate.metafieldDefinitionUpdate.userErrors,
    `metafieldDefinitionUpdate(custom.${definition.key})`
  );

  const metaobjectUpdate = await shopifyAdminRequest<any>(METAOBJECT_UPDATE_MUTATION, {
    id: filterDefinitionId,
    metaobject: { fields: [{ key: 'choices', value: JSON.stringify(updatedChoices) }] },
  });
  assertNoUserErrors(
    metaobjectUpdate.metaobjectUpdate.userErrors,
    `metaobjectUpdate(filter_definition ${definition.key}.choices)`
  );

  return { ...definition, choices: updatedChoices };
}

import 'server-only';
import type { ProductLineSummary } from '@/data/products';
import type { AttentionItem } from '../components/LiveDashboardStats';
import type { InventorySnapshotRow } from '../hooks/useLiveInventoryTable';

/** Flattens every Flavour with a real inventory item out of a Product Lines list into the two
 * shapes the stock-attention UI needs: the live quantity feed (`useLiveInventoryTable`) and the
 * per-Flavour lookup (image/product/flavour name) that quantities get joined against. Shared by
 * the Dashboard's summary widget and the full /products/attention list so both start from the
 * identical set of rows. */
export function buildAttentionData(products: ProductLineSummary[]): {
  initialInventoryRows: InventorySnapshotRow[];
  attentionLookup: AttentionItem[];
} {
  const withInventoryItem = (p: ProductLineSummary) =>
    p.variantStock.filter((v): v is { inventoryItemId: string; quantity: number; title: string } => !!v.inventoryItemId);

  return {
    initialInventoryRows: products.flatMap((p) =>
      withInventoryItem(p).map((v) => ({ inventory_item_id: v.inventoryItemId, quantity: v.quantity }))
    ),
    attentionLookup: products.flatMap((p) =>
      withInventoryItem(p).map((v) => ({
        inventoryItemId: v.inventoryItemId,
        productId: p.id,
        productTitle: p.title,
        flavourTitle: v.title,
        imageUrl: p.imageUrl,
      }))
    ),
  };
}

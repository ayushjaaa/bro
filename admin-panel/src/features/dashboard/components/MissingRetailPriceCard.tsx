import Link from 'next/link';
import { DashCard, DashCardHeader } from './DashCard';
import { WarningIcon } from '@/components/icons';

export type MissingRetailPriceProduct = { id: string; title: string; missingCount: number };

/**
 * Dual-pricing feature (retail/wholesale) -- flags Product Lines with at least one variant
 * missing the `custom.retail_price` metafield. These variants still sell fine (a retail customer
 * just falls back to the native/wholesale price), so this is a visibility nudge, not a blocker --
 * same posture and layout as IncompleteProductLinesCard, kept as its own card rather than merged
 * into that one since "0 flavours" and "missing a price field" are different kinds of gaps.
 */
export default function MissingRetailPriceCard({ products }: { products: MissingRetailPriceProduct[] }) {
  return (
    <DashCard overflowHidden>
      <DashCardHeader
        title={
          <span className="flex items-center gap-1.5">
            <WarningIcon className="size-4 text-dash-warning" />
            Missing Retail Price
          </span>
        }
        count={products.length}
      />
      {products.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-dash-text-muted">
          None — every Flavour has a Retail Price set.
        </p>
      ) : (
        <ul>
          {products.map((p) => {
            const numericId = p.id.split('/').pop();
            return (
              <li key={p.id} className="border-b border-dash-divider last:border-0">
                <Link
                  href={`/products/${numericId}/variants`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-50"
                >
                  <span className="font-medium text-dash-text-ink">{p.title}</span>
                  <span className="text-xs font-medium text-dash-warning">
                    {p.missingCount} flavour{p.missingCount === 1 ? '' : 's'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </DashCard>
  );
}

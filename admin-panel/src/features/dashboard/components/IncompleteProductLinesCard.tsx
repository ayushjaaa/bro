import Link from 'next/link';
import { DashCard, DashCardHeader } from './DashCard';
import { WarningIcon } from '@/components/icons';

type IncompleteProduct = { id: string; title: string };

/**
 * Extracted from a ~30-line inline JSX block in page.tsx (§0a) -- 0-flavour Product Lines,
 * not sellable yet. Purely presentational: the `incomplete` list is computed upstream in
 * page.tsx's data-assembly block and passed through unchanged.
 */
export default function IncompleteProductLinesCard({ incomplete }: { incomplete: IncompleteProduct[] }) {
  return (
    <DashCard overflowHidden>
      <DashCardHeader
        title={
          <span className="flex items-center gap-1.5">
            <WarningIcon className="size-4 text-dash-warning" />
            Incomplete Product Lines — 0 flavours
          </span>
        }
        count={incomplete.length}
      />
      {incomplete.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-dash-text-muted">
          None — every Product Line has at least one Flavour.
        </p>
      ) : (
        <ul>
          {incomplete.map((p) => {
            const numericId = p.id.split('/').pop();
            return (
              <li key={p.id} className="border-b border-dash-divider last:border-0">
                <Link
                  href={`/products/${numericId}/variants`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-neutral-50"
                >
                  <span className="font-medium text-dash-text-ink">{p.title}</span>
                  <span className="text-xs font-medium text-dash-warning">+ Add Flavours</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </DashCard>
  );
}

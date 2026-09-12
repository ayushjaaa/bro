import { DashCard } from './DashCard';
import { PulseDotIcon } from '@/components/icons';

export type AttentionItem = {
  inventoryItemId: string;
  productId: string;
  productTitle: string;
  flavourTitle: string;
  imageUrl: string | null;
};

export type FunnelStage = { label: string; value: number; colorVar: string };

/**
 * Purely decorative wave silhouette (a fixed smooth curve, recolored per card) -- NOT a time
 * series or trend line. It carries no claim about change over time or period-over-period
 * movement (there's no historical data behind these counts), so the same static shape is
 * reused everywhere; only the tint changes per stage. This keeps the visual flourish honest
 * per the Garbage In-Garbage Out review earlier in this session.
 */
function WaveGraph({ colorVar }: { colorVar: string }) {
  return (
    <svg viewBox="0 0 160 48" className="w-full h-12" preserveAspectRatio="none">
      <path
        d="M0 34 C 14 20, 26 20, 40 30 S 66 44, 80 30 S 106 10, 120 18 S 146 34, 160 24 V48 H0 Z"
        fill={`var(${colorVar})`}
        fillOpacity="0.14"
      />
      <path
        d="M0 34 C 14 20, 26 20, 40 30 S 66 44, 80 30 S 106 10, 120 18 S 146 34, 160 24"
        fill="none"
        stroke={`var(${colorVar})`}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * "Overview" -- rendered by page.tsx just below the full-bleed `DashboardHero`, inside the
 * content wrapper, with a negative top margin (applied by the caller) to visually overlap the
 * hero's bottom edge. Pure Server Component: every number here (`funnelStages`,
 * `publishedCount`, `publishableCount`) is already computed server-side.
 *
 * Shows 4 of the 5 taxonomy stages as individual cards (Sub-categories, Brands, Product
 * Lines, Flavours) -- Categories is folded into the headline caption instead of getting its
 * own card, since it's the least actionable of the 5 (a small, largely fixed root set) and
 * the ask was specifically for 4 cards.
 */
export default function LiveDashboardStats({
  funnelStages,
  publishedCount,
  publishableCount,
}: {
  funnelStages: FunnelStage[];
  publishedCount: number;
  publishableCount: number;
}) {
  const categoriesStage = funnelStages.find((s) => s.label === 'Categories');
  const productLinesStage = funnelStages.find((s) => s.label === 'Product Lines');
  const totalFlavours = funnelStages[funnelStages.length - 1]?.value ?? 0;
  const cardStages = funnelStages.filter((s) => s.label !== 'Categories');

  return (
    <div className="flex flex-col gap-5">
      <DashCard className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-[14.5px] font-bold text-dash-text-ink">Overview</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-dash-pill-success-bg px-2 py-0.5 text-[11px] font-bold text-dash-pill-success-text">
            <PulseDotIcon className="size-2" />
            Live
          </span>
        </div>
        <div className="mt-4 flex items-baseline gap-2.5 flex-wrap">
          <span
            className="flex items-baseline text-dash-text-ink font-extrabold tracking-[-0.02em]"
            style={{ fontSize: 'clamp(26px, 2.6vw, 34px)' }}
          >
            {totalFlavours.toLocaleString('en-CA')} <span className="text-dash-text-muted">flavours</span>
          </span>
          <span className="text-[11px] font-medium text-dash-text-muted">
            {productLinesStage && `across ${productLinesStage.value} product lines`}
            {categoriesStage && `, ${categoriesStage.value} categories`}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cardStages.map((stage, i) => {
            const prev = funnelStages[funnelStages.indexOf(stage) - 1];
            // This taxonomy EXPANDS at each stage (few Categories, more Sub-categories, many
            // more Brands/Flavours) -- it's not a narrowing funnel, so a "% of previous stage"
            // figure is meaningless and can read as an absurd number like "1100%". A "xN"
            // multiplier is the honest way to express growth between stages instead.
            const multiplier = prev && prev.value > 0 ? Math.round((stage.value / prev.value) * 10) / 10 : null;
            const isLast = i === cardStages.length - 1;
            return (
              <div
                key={stage.label}
                className="group relative rounded-xl border border-dash-card-border p-4 opacity-0 animate-[dash-fade-up_0.45s_ease-out_forwards] transition-shadow hover:shadow-md"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className="text-[10.5px] font-bold text-dash-text-label">{stage.label}</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-xl font-extrabold text-dash-text-ink">{stage.value.toLocaleString('en-CA')}</span>
                  {multiplier !== null && <span className="text-[9.5px] font-medium text-dash-text-muted">×{multiplier}</span>}
                </div>
                <div className="mt-4">
                  <WaveGraph colorVar={stage.colorVar} />
                </div>

                {/* Dark tooltip, on hover for every card (not just Flavours) -- each shows the
                   real data already available for that stage: rate vs. the previous stage,
                   plus the publish breakdown specifically on the Flavours card since that's
                   the only stage with that data. */}
                <div className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 flex flex-col gap-0.5 rounded-2xl bg-dash-tooltip-bg px-3.5 py-2 text-white shadow-(--dash-card-shadow) whitespace-nowrap opacity-0 scale-95 transition-all group-hover:opacity-100 group-hover:scale-100">
                  {isLast ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-extrabold tracking-tight">{publishedCount} live</span>
                        <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[9.5px] font-bold text-orange-200">
                          {publishableCount - publishedCount} to publish
                        </span>
                      </div>
                      <span className="text-[9.5px] font-medium text-white/60">of {publishableCount} sellable lines</span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-extrabold tracking-tight">
                        {stage.value.toLocaleString('en-CA')} {stage.label}
                      </span>
                      {prev && multiplier !== null && (
                        <span className="text-[9.5px] font-medium text-white/60">
                          ×{multiplier} vs {prev.value.toLocaleString('en-CA')} {prev.label}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DashCard>
    </div>
  );
}

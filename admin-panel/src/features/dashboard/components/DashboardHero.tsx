'use client';

import Link from 'next/link';
import { useLiveInventoryTable, type InventorySnapshotRow } from '../hooks/useLiveInventoryTable';
import { PulseDotIcon } from '@/components/icons';

/**
 * Full-bleed hero banner -- rendered by page.tsx OUTSIDE the `max-w-6xl mx-auto` content
 * wrapper so its gradient background spans the full page width edge-to-edge (matching the
 * mockup), while its own content stays readable via an inner max-width container. Everything
 * below it (Overview onward) lives inside the normal centered wrapper.
 */
export default function DashboardHero({
  adminEmail,
  initialInventoryRows,
}: {
  adminEmail: string;
  initialInventoryRows: InventorySnapshotRow[];
}) {
  const liveQuantities = useLiveInventoryTable(initialInventoryRows);
  const totalStock = [...liveQuantities.values()].reduce((sum, q) => sum + q, 0);

  return (
    <div
      className="relative overflow-hidden pt-8 pb-20 px-4 h-80 sm:px-6 text-white"
      style={{
        background:
          'radial-gradient(115% 130% at 78% 8%, var(--brand-purple-bright) 0%, var(--brand-purple-accent) 32%, #7c3fc4 62%, var(--brand-purple-deep) 100%)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(60% 80% at 12% 100%, rgba(255,255,255,.16), rgba(255,255,255,0) 70%)' }}
      />
      <div className="relative h-full max-w-7xl mx-auto flex items-end justify-between gap-6 flex-wrap">
        <div className="flex flex-col gap-7">
          <div>
            <p className="text-sm text-white/80">Track your store's stock, catalog health, and sales readiness</p>
            <h1
              className="font-extrabold tracking-tight leading-[1.02] mt-1"
              style={{ fontSize: 'clamp(24px, 3vw, 38px)' }}
            >
              Welcome back, {adminEmail.split('@')[0]}!
            </h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/products/new"
              className="rounded-full bg-white text-dash-text-ink text-sm font-medium px-4 py-2 hover:bg-white/90"
            >
              + Add Product
            </Link>
            <Link
              href="/products"
              className="rounded-full bg-white/16 text-white text-sm font-medium px-4 py-2 hover:bg-white/25 border border-white/30 backdrop-blur"
            >
              View Products
            </Link>
          </div>
        </div>
        <div
          className="relative rounded-[22px] border border-white/30 px-6 py-4 min-w-80 backdrop-blur-xl shadow-[0_20px_50px_rgba(70,30,120,0.25)]"
          style={{ background: 'linear-gradient(150deg, rgba(255,255,255,0.28), rgba(255,255,255,0.08))' }}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-white/90">
            <PulseDotIcon className="size-2 text-emerald-300" />
            Live
          </div>
          <div className="text-3xl font-bold mt-1 text-white">{totalStock.toLocaleString('en-CA')}</div>
          <div className="text-xs text-white/70 mt-0.5">Total Stock across every Flavour</div>
        </div>
      </div>
    </div>
  );
}

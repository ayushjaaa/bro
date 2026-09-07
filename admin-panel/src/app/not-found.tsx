import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-dash-card-border bg-dash-card-bg overflow-hidden text-center">
        <div className="px-6 py-8 flex flex-col items-center gap-2">
          <p className="text-sm font-semibold tracking-wide text-dash-info">404</p>
          <h1 className="text-xl font-semibold text-neutral-900">Page not found</h1>
          <p className="text-sm text-dash-text-muted">
            The page you&apos;re looking for doesn&apos;t exist or may have been moved.
          </p>
          <Link
            href="/"
            className="mt-4 rounded-md bg-dash-info px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export function WarningIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path
        d="M10 3.5 2.5 16.5h15L10 3.5Z"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M10 8.25v3.75" strokeLinecap="round" />
      <circle cx="10" cy="14.25" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function EmptyCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <circle cx="10" cy="10" r="6.75" />
    </svg>
  );
}

export function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PulseDotIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <circle cx="10" cy="10" r="4" fill="currentColor" />
      <circle cx="10" cy="10" r="4" fill="currentColor" className="animate-ping opacity-75" />
    </svg>
  );
}

export function BoxIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <path d="M3 6.5 10 3l7 3.5-7 3.5-7-3.5Z" strokeLinejoin="round" />
      <path d="M3 6.5v7L10 17l7-3.5v-7" strokeLinejoin="round" />
      <path d="M10 10v7" />
    </svg>
  );
}

export function ImageIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <circle cx="7" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <path d="m3 14.5 4.5-4 3 2.5 3-3L17 14" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function HashIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <path d="M7.5 3 5.5 17M14.5 3l-2 14M3 7.5h14M2.5 12.5h14" strokeLinecap="round" />
    </svg>
  );
}

export function FilterIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <path d="M3 4h14l-5.5 6.5v5L8.5 17v-6.5L3 4Z" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4.5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LayersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <path d="M10 3 3 7l7 4 7-4-7-4Z" strokeLinejoin="round" strokeLinecap="round" />
      <path d="m3 10.5 7 4 7-4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="m3 14 7 4 7-4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Small status caret, matching the mockup's ▲/▼ marker next to a status line -- `direction`
 * says whether the number moved into a worse state ('up', e.g. more items need attention) or
 * a resolved one ('down', e.g. fewer/zero), a real read of the current count, not a claimed
 * period-over-period trend. */
export function CaretIcon({ direction = 'up', ...props }: React.SVGProps<SVGSVGElement> & { direction?: 'up' | 'down' }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      {direction === 'up' ? <path d="M10 4.5 16 14H4z" /> : <path d="M10 15.5 4 6h12z" />}
    </svg>
  );
}

export function PhoneIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <path
        d="M4 3.5h2.7l1 3.2-1.7 1.3a9 9 0 0 0 4 4l1.3-1.7 3.2 1v2.7c0 .8-.7 1.4-1.5 1.3C7.8 14.9 5.1 12.2 4.7 6.9c-.06-.75.5-1.4 1.25-1.4Z"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MailIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="m3 5.5 7 5.5 7-5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <circle cx="10" cy="7" r="3.25" />
      <path d="M3.5 16.5c0-3 2.9-5.5 6.5-5.5s6.5 2.5 6.5 5.5" strokeLinecap="round" />
    </svg>
  );
}

export function NoteIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <path d="M5 3.5h10v13l-2.5-1.8L10 16l-2.5-1.3L5 16.5v-13Z" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M7.5 7.5h5M7.5 10.5h5" strokeLinecap="round" />
    </svg>
  );
}

export function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
    </svg>
  );
}

export function HomeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <path d="M3 9.5 10 3l7 6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 8v8.5h10V8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <circle cx="7" cy="6.5" r="2.5" />
      <path d="M2 16.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" strokeLinecap="round" />
      <path d="M13 6.75a2.25 2.25 0 1 1 0 4.5" strokeLinecap="round" />
      <path d="M14.5 12.2c1.98.4 3.5 1.98 3.5 4.3" strokeLinecap="round" />
    </svg>
  );
}

export function CartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} {...props}>
      <path d="M2.5 3.5h2l1.6 9.6a1.5 1.5 0 0 0 1.48 1.25h6.24a1.5 1.5 0 0 0 1.48-1.25l1.2-6.85H5.3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.2" cy="17" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.2" cy="17" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

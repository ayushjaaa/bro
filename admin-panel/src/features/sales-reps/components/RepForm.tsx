'use client';

import { UserIcon, PhoneIcon, MailIcon } from '@/components/icons';

export type RepFormValue = { name: string; phone: string; email: string };

/**
 * Shared rep name/phone/email form -- used for both "create" and "edit" everywhere a rep form
 * appears (Sales Reps page directory, Customer drawer's inline "+ New rep"). Real `<label>`s
 * instead of relying on placeholder text alone (placeholder-as-label disappears the moment
 * someone starts typing, and doesn't help screen readers or scanning) -- each field also gets
 * a small icon so the three fields are visually distinct at a glance, not just three identical
 * boxes stacked on top of each other.
 */
export function RepForm({
  value,
  onChange,
  disabled,
}: {
  value: RepFormValue;
  onChange: (value: RepFormValue) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <LabeledInput
        label="Name"
        icon={<UserIcon className="size-4" />}
        value={value.name}
        onChange={(v) => onChange({ ...value, name: v })}
        placeholder="e.g. Priya Sharma"
        disabled={disabled}
      />
      <LabeledInput
        label="Direct phone"
        icon={<PhoneIcon className="size-4" />}
        value={value.phone}
        onChange={(v) => onChange({ ...value, phone: v })}
        placeholder="e.g. (416) 555-0134"
        type="tel"
        disabled={disabled}
      />
      <LabeledInput
        label="Email"
        icon={<MailIcon className="size-4" />}
        value={value.email}
        onChange={(v) => onChange({ ...value, email: v })}
        placeholder="e.g. priya@company.com"
        type="email"
        disabled={disabled}
      />
    </div>
  );
}

function LabeledInput({
  label,
  icon,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-neutral-600 mb-1">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-brand-purple-accent/30 focus-within:border-brand-purple-deep">
        <span className="text-neutral-400 shrink-0">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full text-sm outline-none placeholder:text-neutral-300 disabled:opacity-50"
        />
      </div>
    </label>
  );
}

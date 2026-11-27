export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg aria-hidden width={size} height={size} viewBox="0 0 32 32">
        <rect width="32" height="32" rx="8" className="fill-brand-600" />
        <path d="M9 11h14M9 16h9M9 21h11" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="23" cy="21" r="2.4" className="fill-emerald-400" />
      </svg>
      <span className="text-base font-bold tracking-tight text-slate-900">Switchboard</span>
    </span>
  );
}

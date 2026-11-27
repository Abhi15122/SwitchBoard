import type { ConnectionState } from '../realtime/useFeed';

const LOOK: Record<ConnectionState, { dot: string; label: string }> = {
  live: { dot: 'bg-emerald-500', label: 'Live' },
  connecting: { dot: 'bg-amber-400 animate-pulse', label: 'Connecting' },
  reconnecting: { dot: 'bg-red-500 animate-pulse', label: 'Reconnecting' },
};

export function ConnectionDot({ state }: { state: ConnectionState }) {
  const { dot, label } = LOOK[state];
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs text-slate-600" title={`Realtime: ${label}`}>
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <span>{label}</span>
    </span>
  );
}

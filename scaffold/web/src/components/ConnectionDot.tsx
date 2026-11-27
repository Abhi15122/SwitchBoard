import type { ConnectionState } from '../realtime/useFeed';

const LOOK: Record<ConnectionState, { dot: string; pill: string; label: string }> = {
  live: { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', label: 'Live' },
  connecting: { dot: 'bg-amber-400 animate-pulse', pill: 'bg-amber-50 text-amber-700 ring-amber-200', label: 'Connecting' },
  reconnecting: { dot: 'bg-red-500 animate-pulse', pill: 'bg-red-50 text-red-700 ring-red-200', label: 'Reconnecting' },
};

export function ConnectionDot({ state }: { state: ConnectionState }) {
  const { dot, pill, label } = LOOK[state];
  return (
    <span role="status" className={`chip ring-1 ${pill}`} title={`Realtime updates: ${label}`}>
      <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

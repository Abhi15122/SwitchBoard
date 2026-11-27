import type { OutboundStatus } from '../api/types';

const LABEL: Record<OutboundStatus, string> = {
  queued: 'Queued',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Failed',
};

function Icon({ status }: { status: OutboundStatus }) {
  const common = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (status) {
    case 'queued':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v3l2 1.5" />
        </svg>
      );
    case 'sent':
      return (
        <svg {...common}>
          <path d="M3 8.5l3 3 7-7" />
        </svg>
      );
    case 'delivered':
      return (
        <svg {...common}>
          <path d="M1.5 8.5l3 3 7-7" />
          <path d="M7.5 11.5l7-7" />
        </svg>
      );
    case 'failed':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 5v3.5M8 11h.01" />
        </svg>
      );
  }
}

export function StatusTicks({ status }: { status: OutboundStatus }) {
  const tone = status === 'failed' ? 'text-red-200' : status === 'delivered' ? 'text-emerald-200' : 'text-brand-100';
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`} title={LABEL[status]}>
      <Icon status={status} />
      <span>{LABEL[status]}</span>
    </span>
  );
}

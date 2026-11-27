import { useMemo, useState } from 'react';
import type { ConversationSummary } from '../api/types';
import type { LoadStatus } from '../inbox/useInbox';
import { formatPhone } from '../lib/contact';
import { relativeTime, useNow } from '../lib/time';
import { Avatar } from './Avatar';

interface Props {
  items: ConversationSummary[];
  selected: string | null;
  status: LoadStatus;
  meSub: string;
  hasMore: boolean;
  loadingMore: boolean;
  moreFailed: boolean;
  onSelect: (contact: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}

type Filter = 'all' | 'mine' | 'unassigned' | 'closed';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Open' },
  { id: 'mine', label: 'Mine' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'closed', label: 'Closed' },
];

function matches(c: ConversationSummary, filter: Filter, meSub: string): boolean {
  switch (filter) {
    case 'all':
      return c.status === 'open';
    case 'mine':
      return c.status === 'open' && c.assignee === meSub;
    case 'unassigned':
      return c.status === 'open' && c.assignee === null;
    case 'closed':
      return c.status === 'closed';
  }
}

function Skeleton() {
  return (
    <ul aria-hidden className="space-y-1 p-2">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex animate-pulse items-center gap-3 rounded-lg p-3">
          <span className="h-10 w-10 rounded-full bg-slate-200" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-2/3 rounded bg-slate-200" />
            <span className="block h-3 w-1/2 rounded bg-slate-100" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function InboxList({ items, selected, status, meSub, hasMore, loadingMore, moreFailed, onSelect, onLoadMore, onRetry }: Props) {
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: 0, mine: 0, unassigned: 0, closed: 0 };
    for (const c of items) for (const f of FILTERS) if (matches(c, f.id, meSub)) out[f.id]++;
    return out;
  }, [items, meSub]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return items.filter(
      (c) =>
        matches(c, filter, meSub) &&
        (!q || (digits && c.contact.includes(digits)) || (c.lastText ?? '').toLowerCase().includes(q)),
    );
  }, [items, filter, meSub, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-slate-200 p-3">
        <div className="relative">
          <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            aria-label="Search conversations"
            placeholder="Search number or message"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-9 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div role="tablist" aria-label="Filter conversations" className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                filter === f.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {f.label}
              <span className={`tabular-nums ${filter === f.id ? 'text-brand-600' : 'text-slate-400'}`}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' && <Skeleton />}
      {status === 'error' && (
        <div role="alert" className="m-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Could not load conversations.</p>
          <button type="button" onClick={onRetry} className="btn btn-secondary mt-3">
            Try again
          </button>
        </div>
      )}
      {status === 'ready' && visible.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">💬</span>
          <p className="text-sm font-medium text-slate-700">{items.length === 0 ? 'No conversations yet' : 'Nothing here'}</p>
          <p className="mt-1 text-xs text-slate-500">
            {items.length === 0 ? 'New customer messages will appear here in real time.' : 'Try another filter or search.'}
          </p>
        </div>
      )}

      {status === 'ready' && visible.length > 0 && (
        <nav aria-label="Conversations" className="flex-1 overflow-y-auto p-2">
          <ul className="space-y-0.5">
            {visible.map((c) => {
              const active = c.contact === selected;
              return (
                <li key={c.contact}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.contact)}
                    aria-current={active ? 'true' : undefined}
                    className={`flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 ${
                      active ? 'bg-brand-50 ring-1 ring-brand-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <Avatar label={c.contact} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-sm font-semibold tabular-nums ${c.status === 'closed' ? 'text-slate-500' : 'text-slate-900'}`}>
                          {formatPhone(c.contact)}
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">{relativeTime(c.lastActivityAt, now)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-slate-500">{c.lastText ?? 'No messages yet'}</span>
                      <span className="mt-1.5 flex gap-1.5 empty:hidden">
                        {c.assignee !== null && (
                          <span className={`chip ${c.assignee === meSub ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                            {c.assignee === meSub ? 'You' : c.assignee}
                          </span>
                        )}
                        {c.assignee === null && c.status === 'open' && <span className="chip bg-amber-50 text-amber-700">Unassigned</span>}
                        {c.status === 'closed' && <span className="chip bg-slate-100 text-slate-500">Closed</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <div className="p-3 text-center">
              <button type="button" onClick={onLoadMore} disabled={loadingMore} className="btn btn-secondary">
                {loadingMore ? 'Loading...' : 'Load older conversations'}
              </button>
              {moreFailed && (
                <p role="alert" className="mt-2 text-sm text-red-700">
                  Could not load more.
                </p>
              )}
            </div>
          )}
        </nav>
      )}
    </div>
  );
}

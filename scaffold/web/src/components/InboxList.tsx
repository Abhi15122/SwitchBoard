import type { ConversationSummary } from '../api/types';
import type { LoadStatus } from '../inbox/useInbox';
import { relativeTime, useNow } from '../lib/time';

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

export function InboxList({ items, selected, status, meSub, hasMore, loadingMore, moreFailed, onSelect, onLoadMore, onRetry }: Props) {
  const now = useNow();

  if (status === 'loading') return <p className="p-4 text-sm text-slate-500">Loading conversations...</p>;
  if (status === 'error') {
    return (
      <div role="alert" className="p-4 text-sm text-red-700">
        <p>Could not load conversations.</p>
        <button type="button" onClick={onRetry} className="mt-2 rounded border border-red-300 px-3 py-1 hover:bg-red-50">
          Try again
        </button>
      </div>
    );
  }
  if (items.length === 0) return <p className="p-4 text-sm text-slate-500">No conversations yet. New messages will appear here.</p>;

  return (
    <nav aria-label="Conversations" className="flex-1 overflow-y-auto">
      <ul className="divide-y divide-slate-200">
        {items.map((c) => (
          <li key={c.contact}>
            <button
              type="button"
              onClick={() => onSelect(c.contact)}
              aria-current={c.contact === selected ? 'true' : undefined}
              className={`block w-full px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 ${
                c.contact === selected ? 'bg-indigo-50' : ''
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium text-slate-900">{c.contact}</span>
                <span className="shrink-0 text-xs text-slate-500">{relativeTime(c.lastActivityAt, now)}</span>
              </div>
              <p className="mt-0.5 truncate text-sm text-slate-600">{c.lastText ?? 'No messages yet'}</p>
              <div className="mt-1 flex gap-1.5 empty:hidden">
                {c.assignee !== null && (
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-800">
                    {c.assignee === meSub ? 'You' : c.assignee}
                  </span>
                )}
                {c.status === 'closed' && (
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">Closed</span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {hasMore && (
        <div className="p-3 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
          {moreFailed && <p role="alert" className="mt-2 text-sm text-red-700">Could not load more.</p>}
        </div>
      )}
    </nav>
  );
}

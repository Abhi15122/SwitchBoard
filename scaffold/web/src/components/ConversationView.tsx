import { useEffect, useRef } from 'react';
import type { Message, OutboundStatus } from '../api/types';
import { relativeTime, useNow } from '../lib/time';

const STATUS_LOOK: Record<OutboundStatus, string> = {
  queued: 'bg-slate-200 text-slate-700',
  sent: 'bg-sky-100 text-sky-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
};

export function ConversationView({ messages }: { messages: Message[] }) {
  const now = useNow();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (messages.length === 0) {
    return <p className="flex-1 p-6 text-center text-sm text-slate-500">No messages in this conversation yet.</p>;
  }
  return (
    <ol aria-label="Messages" className="flex-1 space-y-3 overflow-y-auto p-4">
      {messages.map((m) => (
        <li key={`${m.kind}:${m.id}`} className={`flex ${m.kind === 'outbound' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`max-w-[80%] rounded-lg px-3 py-2 ${
              m.kind === 'outbound' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-900'
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{m.text}</p>
            <p className={`mt-1 flex items-center gap-2 text-xs ${m.kind === 'outbound' ? 'text-indigo-100' : 'text-slate-500'}`}>
              <span>{relativeTime(m.at, now)}</span>
              {m.kind === 'outbound' && (
                <span className={`rounded px-1.5 py-0.5 font-medium ${STATUS_LOOK[m.status]}`}>{m.status}</span>
              )}
            </p>
          </div>
        </li>
      ))}
      <div ref={end} />
    </ol>
  );
}

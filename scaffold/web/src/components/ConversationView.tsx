import { Fragment, useEffect, useRef } from 'react';
import type { Message } from '../api/types';
import { relativeTime, useNow } from '../lib/time';
import { StatusTicks } from './StatusTicks';

function dayLabel(iso: string, now: number): string {
  const d = new Date(iso);
  const today = new Date(now);
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function ConversationView({ messages, meSub }: { messages: Message[]; meSub: string }) {
  const now = useNow();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="text-sm font-medium text-slate-700">No messages yet</p>
        <p className="mt-1 text-xs text-slate-500">Write the first reply below. It goes out as soon as you send it.</p>
      </div>
    );
  }

  return (
    <ol aria-label="Messages" className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-4 py-6 sm:px-8">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
        const out = m.kind === 'outbound';
        const grouped = prev !== undefined && !newDay && prev.kind === m.kind;
        return (
          <Fragment key={`${m.kind}:${m.id}`}>
            {newDay && (
              <li role="separator" className="flex items-center gap-3 py-2 text-xs font-medium text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                {dayLabel(m.at, now)}
                <span className="h-px flex-1 bg-slate-200" />
              </li>
            )}
            <li className={`flex ${out ? 'justify-end' : 'justify-start'} ${grouped ? '' : 'pt-2'}`}>
              <div className="max-w-[78%]">
                {out && !grouped && (
                  <p className="mb-1 text-right text-xs text-slate-400">
                    {m.authorSub === null ? 'Switchboard' : m.authorSub === meSub ? 'You' : m.authorSub}
                  </p>
                )}
                <div
                  title={relativeTime(m.at, now)}
                  className={`rounded-2xl px-3.5 py-2 shadow-sm ${
                    out
                      ? `rounded-br-md text-white ${m.status === 'failed' ? 'bg-red-600' : 'bg-brand-600'}`
                      : 'rounded-bl-md border border-slate-200 bg-white text-slate-900'
                  }`}
                >
                  <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{m.text}</p>
                  <p className={`mt-1 flex items-center justify-end gap-2 text-[11px] ${out ? 'text-brand-100' : 'text-slate-400'}`}>
                    <span>{clock(m.at)}</span>
                    {out && <StatusTicks status={m.status} />}
                  </p>
                </div>
              </div>
            </li>
          </Fragment>
        );
      })}
      <div ref={end} />
    </ol>
  );
}

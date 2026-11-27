import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

export function ReplyBox({ onSend, closed }: { onSend: (text: string, clientRef: string) => Promise<void>; closed: boolean }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const [sending, setSending] = useState(false);
  const clientRef = useRef<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const trimmed = text.trim();

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  async function submit() {
    if (!trimmed || sending) return;
    clientRef.current ??= crypto.randomUUID();
    setSending(true);
    setError(false);
    try {
      await onSend(trimmed, clientRef.current);
      clientRef.current = null;
      setText('');
    } catch {
      setError(true);
    } finally {
      setSending(false);
      box.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="border-t border-slate-200 bg-white px-4 py-3"
    >
      {error && (
        <p role="alert" className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not send. Your message is still here, press Send to retry.
        </p>
      )}
      {closed && !error && <p className="mb-2 text-xs text-slate-500">This conversation is closed. Sending a reply reopens it.</p>}
      <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-1.5 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        <textarea
          ref={box}
          aria-label="Reply"
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            clientRef.current = null;
          }}
          onKeyDown={onKeyDown}
          placeholder="Write a reply..."
          className="max-h-40 min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-slate-400 focus:outline-none"
        />
        <button type="submit" disabled={!trimmed || sending} aria-label="Send reply" className="btn btn-primary h-9 rounded-lg">
          {sending ? 'Sending...' : 'Send'}
          <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8h11M9 4l4 4-4 4" />
          </svg>
        </button>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-slate-400">
        <kbd className="font-sans font-medium">Enter</kbd> to send, <kbd className="font-sans font-medium">Shift + Enter</kbd> for a new line
      </p>
    </form>
  );
}

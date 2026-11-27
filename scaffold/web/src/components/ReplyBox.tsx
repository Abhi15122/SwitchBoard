import { useRef, useState, type KeyboardEvent } from 'react';

export function ReplyBox({ onSend }: { onSend: (text: string, clientRef: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const [sending, setSending] = useState(false);
  const clientRef = useRef<string | null>(null);

  const trimmed = text.trim();

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
      className="border-t border-slate-200 bg-white p-3"
    >
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          Could not send. Your message is still here, press Send to retry.
        </p>
      )}
      <div className="flex gap-2">
        <textarea
          aria-label="Reply"
          rows={2}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            clientRef.current = null;
          }}
          onKeyDown={onKeyDown}
          placeholder="Write a reply. Enter sends, Shift+Enter adds a line."
          className="min-w-0 flex-1 resize-none rounded border border-slate-300 p-2 text-sm"
        />
        <button
          type="submit"
          disabled={!trimmed || sending}
          className="self-end rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </form>
  );
}

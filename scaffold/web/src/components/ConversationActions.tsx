import { useState } from 'react';
import { holderFromConflict } from '../api/client';
import type { ConversationAction, ConversationHead, Role } from '../api/types';

interface Props {
  head: ConversationHead;
  meSub: string;
  role: Role;
  onAct: (action: ConversationAction) => Promise<void>;
}

export function ConversationActions({ head, meSub, role, onAct }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const mine = head.assignee === meSub;
  const canClaim = head.assignee === null;
  const canRelease = mine || (head.assignee !== null && role === 'admin');

  async function run(action: ConversationAction) {
    setBusy(true);
    setMessage(null);
    try {
      await onAct(action);
    } catch (err) {
      const holder = holderFromConflict(err);
      setMessage(holder !== null ? `Already claimed by ${holder === meSub ? 'you' : holder}.` : `Could not ${action} this conversation.`);
    } finally {
      setBusy(false);
    }
  }

  const button = (action: ConversationAction, label: string) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => void run(action)}
      className="rounded border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-50"
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canClaim && head.status === 'open' && button('claim', 'Claim')}
      {canRelease && button('release', 'Release')}
      {head.status === 'open' ? button('close', 'Close') : button('reopen', 'Reopen')}
      {message && (
        <span role="alert" className="text-sm text-red-700">
          {message}
        </span>
      )}
    </div>
  );
}

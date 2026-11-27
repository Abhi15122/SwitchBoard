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
  const [busy, setBusy] = useState<ConversationAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const mine = head.assignee === meSub;
  const canClaim = head.assignee === null && head.status === 'open';
  const canRelease = mine || (head.assignee !== null && role === 'admin');

  async function run(action: ConversationAction) {
    setBusy(action);
    setMessage(null);
    try {
      await onAct(action);
    } catch (err) {
      const holder = holderFromConflict(err);
      setMessage(holder !== null ? `Already claimed by ${holder === meSub ? 'you' : holder}.` : `Could not ${action} this conversation.`);
    } finally {
      setBusy(null);
    }
  }

  const button = (action: ConversationAction, label: string, look: 'btn-primary' | 'btn-secondary') => (
    <button type="button" disabled={busy !== null} onClick={() => void run(action)} className={`btn ${look}`}>
      {busy === action ? `${label}...` : label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {message && (
        <span role="alert" className="text-sm text-red-700">
          {message}
        </span>
      )}
      {canClaim && button('claim', 'Claim', 'btn-primary')}
      {canRelease && button('release', mine ? 'Release' : 'Unassign', 'btn-secondary')}
      {head.status === 'open' ? button('close', 'Close', 'btn-secondary') : button('reopen', 'Reopen', 'btn-primary')}
    </div>
  );
}

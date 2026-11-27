import { describe, expect, it } from 'vitest';
import type {
  ConversationDetail,
  ConversationSummary,
  Frame,
  OutboundMessage,
} from '../api/types';
import { advanceStatus, inboxReducer, initialInbox, type InboxAction, type InboxState } from './inboxReducer';

const A = '+15550000001';
const B = '+15550000002';
const C = '+15550000003';

function summary(contact: string, over: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    contact,
    assignee: null,
    status: 'open',
    lastActivityAt: '2026-01-01T00:00:00Z',
    lastText: `hello from ${contact}`,
    ...over,
  };
}

function outbound(id: string, over: Partial<OutboundMessage> = {}): OutboundMessage {
  return { kind: 'outbound', id, text: 'hi', at: '2026-01-01T00:01:00Z', status: 'queued', authorSub: 'me', ...over };
}

function detail(contact: string, messages: ConversationDetail['messages'], over = {}): ConversationDetail {
  return { conversation: { contact, assignee: null, status: 'open', ...over }, messages };
}

function run(state: InboxState, ...actions: InboxAction[]): InboxState {
  return actions.reduce(inboxReducer, state);
}

const frame = (f: Frame): InboxAction => ({ type: 'frame', frame: f });

function withList(...contacts: string[]): InboxState {
  return run(initialInbox, {
    type: 'listLoaded',
    mode: 'refresh',
    page: { items: contacts.map((c) => summary(c)), nextCursor: null },
  });
}

function withOpen(contact: string, messages: ConversationDetail['messages'], over = {}): InboxState {
  return run(withList(A, B, C), { type: 'select', contact }, { type: 'conversationLoaded', detail: detail(contact, messages, over) });
}

describe('seq handling', () => {
  it('ignores duplicates and older frames', () => {
    const f: Frame = { seq: 5, type: 'conversation.assigned', contact: A, assignee: 'x' };
    const once = run(withList(A), frame(f));
    expect(once.lastSeq).toBe(5);
    expect(once.list[0].assignee).toBe('x');

    const again = run(once, frame({ ...f, assignee: 'y' }), frame({ ...f, seq: 3, assignee: 'z' }));
    expect(again).toBe(once);
  });

  it('applies frames strictly by increasing seq, skipping gaps', () => {
    const s = run(
      withList(A),
      frame({ seq: 2, type: 'conversation.assigned', contact: A, assignee: 'first' }),
      frame({ seq: 9, type: 'conversation.assigned', contact: A, assignee: 'second' }),
      frame({ seq: 4, type: 'conversation.assigned', contact: A, assignee: 'late' }),
    );
    expect(s.list[0].assignee).toBe('second');
    expect(s.lastSeq).toBe(9);
  });
});

describe('message.inbound', () => {
  it('moves the conversation to the top and reopens it', () => {
    const s = run(
      run(initialInbox, { type: 'listLoaded', mode: 'refresh', page: { items: [summary(A), summary(B), summary(C, { status: 'closed' })], nextCursor: null } }),
      frame({ seq: 1, type: 'message.inbound', contact: C, messageId: 'm1' }),
    );
    expect(s.list.map((c) => c.contact)).toEqual([C, A, B]);
    expect(s.list[0].status).toBe('open');
  });

  it('asks for a list refetch, and an open-conversation refetch only for the open contact', () => {
    const open = withOpen(A, []);
    const other = run(open, frame({ seq: 1, type: 'message.inbound', contact: B, messageId: 'm1' }));
    expect(other.listRefresh).toBe(open.listRefresh + 1);
    expect(other.openRefresh).toBe(open.openRefresh);

    const same = run(open, frame({ seq: 1, type: 'message.inbound', contact: A, messageId: 'm1' }));
    expect(same.openRefresh).toBe(open.openRefresh + 1);
  });

  it('reopens the open conversation head', () => {
    const open = withOpen(A, [], { status: 'closed' });
    const s = run(open, frame({ seq: 1, type: 'message.inbound', contact: A, messageId: 'm1' }));
    expect(s.open?.head.status).toBe('open');
  });

  it('still requests a list refetch for a contact not yet in the list', () => {
    const s = run(withList(A), frame({ seq: 1, type: 'message.inbound', contact: B, messageId: 'm1' }));
    expect(s.list.map((c) => c.contact)).toEqual([A]);
    expect(s.listRefresh).toBe(1);
  });
});

describe('message.status', () => {
  const status = (seq: number, s: 'sent' | 'delivered' | 'failed' | 'queued'): InboxAction =>
    frame({ seq, type: 'message.status', contact: A, clientRef: 'r1', status: s });
  const statusOf = (s: InboxState) => (s.open?.messages[0] as OutboundMessage).status;

  it('moves forward', () => {
    const s = run(withOpen(A, [outbound('r1')]), status(1, 'sent'), status(2, 'delivered'));
    expect(statusOf(s)).toBe('delivered');
  });

  it('never goes backwards when frames arrive out of order', () => {
    const s = run(withOpen(A, [outbound('r1')]), status(5, 'delivered'));
    expect(statusOf(run(s, status(6, 'sent'), status(7, 'queued')))).toBe('delivered');
  });

  it('lets failed follow sent but not replace delivered', () => {
    expect(statusOf(run(withOpen(A, [outbound('r1')]), status(1, 'sent'), status(2, 'failed')))).toBe('failed');
    expect(statusOf(run(withOpen(A, [outbound('r1')]), status(1, 'delivered'), status(2, 'failed')))).toBe('delivered');
    expect(statusOf(run(withOpen(A, [outbound('r1')]), status(1, 'failed'), status(2, 'delivered')))).toBe('failed');
  });

  it('asks for a refetch when the message is not loaded', () => {
    const open = withOpen(A, []);
    const s = run(open, status(1, 'sent'));
    expect(s.openRefresh).toBe(open.openRefresh + 1);
  });

  it('ignores status for a conversation that is not open', () => {
    const s = run(withOpen(B, [outbound('r1')]), status(1, 'sent'));
    expect(s.open?.messages[0]).toMatchObject({ status: 'queued' });
  });
});

describe('conversation.status', () => {
  it('updates the list and the open head', () => {
    const s = run(withOpen(A, []), frame({ seq: 1, type: 'conversation.status', contact: A, status: 'closed' }));
    expect(s.list[0].status).toBe('closed');
    expect(s.open?.head.status).toBe('closed');
  });
});

describe('conversation.assigned', () => {
  it('updates the list and the open head, and can clear the assignee', () => {
    const open = withOpen(A, []);
    const s = run(open, frame({ seq: 1, type: 'conversation.assigned', contact: A, assignee: 'u1' }));
    expect(s.list[0].assignee).toBe('u1');
    expect(s.open?.head.assignee).toBe('u1');
    const cleared = run(s, frame({ seq: 2, type: 'conversation.assigned', contact: A, assignee: null }));
    expect(cleared.open?.head.assignee).toBeNull();
  });

  it('does not reorder the list', () => {
    const s = run(withList(A, B), frame({ seq: 1, type: 'conversation.assigned', contact: B, assignee: 'u1' }));
    expect(s.list.map((c) => c.contact)).toEqual([A, B]);
  });
});

describe('message.outbound', () => {
  it('adds nothing and requests nothing when the client_ref is already shown', () => {
    const open = run(withOpen(A, []), { type: 'replyQueued', contact: A, message: outbound('r1') });
    const s = run(open, frame({ seq: 1, type: 'message.outbound', contact: A, clientRef: 'r1' }));
    expect(s.open?.messages).toHaveLength(1);
    expect(s.openRefresh).toBe(open.openRefresh);
    expect(s.listRefresh).toBe(open.listRefresh);
  });

  it('requests a refetch for a reply sent elsewhere', () => {
    const open = withOpen(A, []);
    const s = run(open, frame({ seq: 1, type: 'message.outbound', contact: A, clientRef: 'other' }));
    expect(s.open?.messages).toHaveLength(0);
    expect(s.openRefresh).toBe(open.openRefresh + 1);
    expect(s.listRefresh).toBe(open.listRefresh + 1);
  });
});

describe('optimistic reply', () => {
  it('shows the reply as queued immediately and moves the conversation up', () => {
    const s = run(withOpen(B, []), { type: 'replyQueued', contact: B, message: outbound('r1', { text: 'on it' }) });
    expect(s.open?.messages).toEqual([expect.objectContaining({ id: 'r1', status: 'queued' })]);
    expect(s.list[0]).toMatchObject({ contact: B, lastText: 'on it' });
  });

  it('is the same reply when queued twice with one client_ref', () => {
    const once = run(withOpen(A, []), { type: 'replyQueued', contact: A, message: outbound('r1') });
    const twice = run(once, { type: 'replyQueued', contact: A, message: outbound('r1') });
    expect(twice).toBe(once);
  });

  it('reconciles by id when server data arrives, without duplicating or regressing', () => {
    const queued = run(withOpen(A, []), { type: 'replyQueued', contact: A, message: outbound('r1') });
    const advanced = run(queued, frame({ seq: 1, type: 'message.status', contact: A, clientRef: 'r1', status: 'delivered' }));
    const loaded = run(advanced, {
      type: 'conversationLoaded',
      detail: detail(A, [{ kind: 'inbound', id: 'in1', text: 'q', at: '2026-01-01T00:00:00Z' }, outbound('r1', { status: 'sent', text: 'hi' })]),
    });
    expect(loaded.open?.messages.map((m) => m.id)).toEqual(['in1', 'r1']);
    expect((loaded.open?.messages[1] as OutboundMessage).status).toBe('delivered');
  });

  it('keeps a pending reply that a slightly older fetch did not include', () => {
    const queued = run(withOpen(A, []), { type: 'replyQueued', contact: A, message: outbound('r1') });
    const loaded = run(queued, { type: 'conversationLoaded', detail: detail(A, []) });
    expect(loaded.open?.messages.map((m) => m.id)).toEqual(['r1']);
  });

  it('removes a queued reply whose request failed, but not one that moved on', () => {
    const queued = run(withOpen(A, []), { type: 'replyQueued', contact: A, message: outbound('r1') });
    expect(run(queued, { type: 'replyDiscarded', contact: A, clientRef: 'r1' }).open?.messages).toEqual([]);
    const sent = run(queued, frame({ seq: 1, type: 'message.status', contact: A, clientRef: 'r1', status: 'sent' }));
    expect(run(sent, { type: 'replyDiscarded', contact: A, clientRef: 'r1' }).open?.messages).toHaveLength(1);
  });
});

describe('list and selection', () => {
  it('append dedupes and takes the new cursor', () => {
    const first = run(initialInbox, { type: 'listLoaded', mode: 'refresh', page: { items: [summary(A), summary(B)], nextCursor: 'c1' } });
    const s = run(first, { type: 'listLoaded', mode: 'append', page: { items: [summary(B), summary(C)], nextCursor: null } });
    expect(s.list.map((c) => c.contact)).toEqual([A, B, C]);
    expect(s.nextCursor).toBeNull();
  });

  it('a refresh keeps deeper pages and their cursor, and takes fresh data for the head', () => {
    const deep = run(
      initialInbox,
      { type: 'listLoaded', mode: 'refresh', page: { items: [summary(A)], nextCursor: 'c1' } },
      { type: 'listLoaded', mode: 'append', page: { items: [summary(B), summary(C)], nextCursor: 'c2' } },
    );
    const s = run(deep, { type: 'listLoaded', mode: 'refresh', page: { items: [summary(C, { lastText: 'new' }), summary(A)], nextCursor: 'c1' } });
    expect(s.list.map((c) => c.contact)).toEqual([C, A, B]);
    expect(s.list[0].lastText).toBe('new');
    expect(s.nextCursor).toBe('c2');
  });

  it('ignores a conversation that finished loading after the user moved on', () => {
    const s = run(withList(A, B), { type: 'select', contact: A }, { type: 'select', contact: B }, { type: 'conversationLoaded', detail: detail(A, []) });
    expect(s.open).toBeNull();
  });

  it('resync requests both refetches', () => {
    const s = run(initialInbox, { type: 'resync' });
    expect(s).toMatchObject({ listRefresh: 1, openRefresh: 1 });
  });

  it('resync accepts frames again from seq 1 after a server reset', () => {
    const s = run(initialInbox, frame({ seq: 40, type: 'conversation.assigned', contact: A, assignee: 'x' }), { type: 'resync' }, frame({ seq: 1, type: 'conversation.assigned', contact: A, assignee: 'y' }));
    expect(s.lastSeq).toBe(1);
  });
});

describe('advanceStatus', () => {
  it('is forward only', () => {
    expect(advanceStatus('queued', 'sent')).toBe('sent');
    expect(advanceStatus('delivered', 'sent')).toBe('delivered');
    expect(advanceStatus('sent', 'sent')).toBe('sent');
  });
});

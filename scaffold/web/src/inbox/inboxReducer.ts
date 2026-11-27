import type {
  ConversationDetail,
  ConversationHead,
  ConversationPage,
  ConversationSummary,
  Frame,
  Message,
  OutboundMessage,
  OutboundStatus,
} from '../api/types';

export interface OpenConversation {
  head: ConversationHead;
  messages: Message[];
}

export interface InboxState {
  /** Highest frame seq applied. */
  lastSeq: number;
  list: ConversationSummary[];
  nextCursor: string | null;
  selected: string | null;
  open: OpenConversation | null;
  /** Bumped whenever the UI should refetch the first page of the list. */
  listRefresh: number;
  /** Bumped whenever the UI should refetch the selected conversation. */
  openRefresh: number;
}

export const initialInbox: InboxState = {
  lastSeq: 0,
  list: [],
  nextCursor: null,
  selected: null,
  open: null,
  listRefresh: 0,
  openRefresh: 0,
};

export type InboxAction =
  | { type: 'frame'; frame: Frame }
  | { type: 'listLoaded'; page: ConversationPage; mode: 'refresh' | 'append' }
  | { type: 'select'; contact: string | null }
  | { type: 'conversationLoaded'; detail: ConversationDetail }
  | { type: 'replyQueued'; contact: string; message: OutboundMessage }
  | { type: 'replyDiscarded'; contact: string; clientRef: string }
  | { type: 'resync' };

const STATUS_RANK: Record<OutboundStatus, number> = { queued: 0, sent: 1, delivered: 2, failed: 2 };

/** Statuses only move forward; delivered and failed are both final. */
export function advanceStatus(current: OutboundStatus, next: OutboundStatus): OutboundStatus {
  return STATUS_RANK[next] > STATUS_RANK[current] ? next : current;
}

function patchListItem(
  list: ConversationSummary[],
  contact: string,
  patch: (c: ConversationSummary) => ConversationSummary,
  moveToTop: boolean,
): ConversationSummary[] {
  const i = list.findIndex((c) => c.contact === contact);
  if (i === -1) return list;
  const patched = patch(list[i]);
  return moveToTop ? [patched, ...list.slice(0, i), ...list.slice(i + 1)] : list.map((c, j) => (j === i ? patched : c));
}

function mergeList(first: ConversationSummary[], rest: ConversationSummary[]): ConversationSummary[] {
  const seen = new Set(first.map((c) => c.contact));
  return [...first, ...rest.filter((c) => !seen.has(c.contact))];
}

function hasMessage(open: OpenConversation | null, id: string): boolean {
  return open !== null && open.messages.some((m) => m.id === id);
}

function mergeMessages(local: Message[], server: Message[]): Message[] {
  const localById = new Map(local.map((m) => [m.id, m]));
  const serverIds = new Set(server.map((m) => m.id));
  const merged = server.map((m) => {
    const prev = localById.get(m.id);
    return m.kind === 'outbound' && prev?.kind === 'outbound'
      ? { ...m, status: advanceStatus(prev.status, m.status) }
      : m;
  });
  const pending = local.filter((m) => m.kind === 'outbound' && !serverIds.has(m.id));
  return [...merged, ...pending];
}

function applyFrame(state: InboxState, frame: Frame): InboxState {
  const base = { ...state, lastSeq: frame.seq };
  const isOpen = state.selected === frame.contact;
  const refetchOpen = isOpen ? state.openRefresh + 1 : state.openRefresh;

  switch (frame.type) {
    case 'message.inbound':
      return {
        ...base,
        list: patchListItem(state.list, frame.contact, (c) => ({ ...c, status: 'open' }), true),
        open:
          isOpen && state.open ? { ...state.open, head: { ...state.open.head, status: 'open' } } : state.open,
        listRefresh: state.listRefresh + 1,
        openRefresh: refetchOpen,
      };

    case 'message.status': {
      if (!isOpen || !state.open) return base;
      if (!hasMessage(state.open, frame.clientRef)) return { ...base, openRefresh: refetchOpen };
      const messages = state.open.messages.map((m) =>
        m.kind === 'outbound' && m.id === frame.clientRef
          ? { ...m, status: advanceStatus(m.status, frame.status) }
          : m,
      );
      return { ...base, open: { ...state.open, messages } };
    }

    case 'conversation.assigned':
      return {
        ...base,
        list: patchListItem(state.list, frame.contact, (c) => ({ ...c, assignee: frame.assignee }), false),
        open:
          isOpen && state.open
            ? { ...state.open, head: { ...state.open.head, assignee: frame.assignee } }
            : state.open,
      };

    case 'conversation.status':
      return {
        ...base,
        list: patchListItem(state.list, frame.contact, (c) => ({ ...c, status: frame.status }), false),
        open:
          isOpen && state.open
            ? { ...state.open, head: { ...state.open.head, status: frame.status } }
            : state.open,
      };

    case 'message.outbound': {
      if (isOpen && hasMessage(state.open, frame.clientRef)) return base;
      return {
        ...base,
        list: patchListItem(state.list, frame.contact, (c) => c, true),
        listRefresh: state.listRefresh + 1,
        openRefresh: refetchOpen,
      };
    }
  }
}

export function inboxReducer(state: InboxState, action: InboxAction): InboxState {
  switch (action.type) {
    case 'frame':
      return action.frame.seq > state.lastSeq ? applyFrame(state, action.frame) : state;

    case 'listLoaded': {
      const { items, nextCursor } = action.page;
      if (action.mode === 'append') {
        return { ...state, list: mergeList(state.list, items), nextCursor };
      }
      const loadedBeyondFirstPage = state.list.length > items.length;
      return {
        ...state,
        list: mergeList(items, state.list),
        nextCursor: loadedBeyondFirstPage ? state.nextCursor : nextCursor,
      };
    }

    case 'select':
      return state.selected === action.contact
        ? state
        : { ...state, selected: action.contact, open: null };

    case 'conversationLoaded': {
      const { conversation, messages } = action.detail;
      if (conversation.contact !== state.selected) return state;
      return {
        ...state,
        open: {
          head: conversation,
          messages: mergeMessages(state.open?.messages ?? [], messages),
        },
        list: patchListItem(
          state.list,
          conversation.contact,
          (c) => ({ ...c, assignee: conversation.assignee, status: conversation.status }),
          false,
        ),
      };
    }

    case 'replyQueued': {
      if (!state.open || state.selected !== action.contact || hasMessage(state.open, action.message.id)) {
        return state;
      }
      return {
        ...state,
        open: { ...state.open, messages: [...state.open.messages, action.message] },
        list: patchListItem(
          state.list,
          action.contact,
          (c) => ({ ...c, lastText: action.message.text, lastActivityAt: action.message.at }),
          true,
        ),
      };
    }

    case 'replyDiscarded': {
      if (!state.open || state.selected !== action.contact) return state;
      const messages = state.open.messages.filter(
        (m) => !(m.kind === 'outbound' && m.id === action.clientRef && m.status === 'queued'),
      );
      return { ...state, open: { ...state.open, messages } };
    }

    case 'resync':
      return { ...state, lastSeq: 0, listRefresh: state.listRefresh + 1, openRefresh: state.openRefresh + 1 };
  }
}

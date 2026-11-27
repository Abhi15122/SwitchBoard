import type {
  ConversationDetail,
  ConversationHead,
  ConversationPage,
  ConversationStatus,
  Frame,
  Message,
  OutboundStatus,
  Role,
  User,
} from './types';

export class ParseError extends Error {
  constructor(what: string) {
    super(`Unexpected response shape: ${what}`);
    this.name = 'ParseError';
  }
}

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new ParseError(what);
  return v as Obj;
}

function arr(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new ParseError(what);
  return v;
}

function str(o: Obj, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new ParseError(key);
  return v;
}

function strOrNull(o: Obj, key: string): string | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new ParseError(key);
  return v;
}

function oneOf<T extends string>(o: Obj, key: string, allowed: readonly T[]): T {
  const v = o[key];
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw new ParseError(key);
  return v as T;
}

const ROLES: readonly Role[] = ['admin', 'agent'];
const CONVERSATION_STATUSES: readonly ConversationStatus[] = ['open', 'closed'];
const OUTBOUND_STATUSES: readonly OutboundStatus[] = ['queued', 'sent', 'delivered', 'failed'];

export function parseUser(raw: unknown): User {
  const o = obj(raw, 'user');
  return {
    sub: str(o, 'sub'),
    name: str(o, 'name'),
    workspaces: arr(o.workspaces, 'workspaces').map((w) => {
      const wo = obj(w, 'workspace');
      return { id: str(wo, 'id'), role: oneOf(wo, 'role', ROLES) };
    }),
  };
}

function parseHead(raw: unknown): ConversationHead {
  const o = obj(raw, 'conversation');
  return {
    contact: str(o, 'contact'),
    assignee: strOrNull(o, 'assignee'),
    status: oneOf(o, 'status', CONVERSATION_STATUSES),
  };
}

export function parseConversationPage(raw: unknown): ConversationPage {
  const o = obj(raw, 'page');
  return {
    items: arr(o.items, 'items').map((item) => {
      const io = obj(item, 'item');
      return {
        ...parseHead(io),
        lastActivityAt: str(io, 'lastActivityAt'),
        lastText: strOrNull(io, 'lastText'),
      };
    }),
    nextCursor: strOrNull(o, 'nextCursor'),
  };
}

function parseMessage(raw: unknown): Message {
  const o = obj(raw, 'message');
  const base = { id: str(o, 'id'), text: str(o, 'text'), at: str(o, 'at') };
  if (o.kind === 'inbound') return { kind: 'inbound', ...base };
  if (o.kind !== 'outbound') throw new ParseError('kind');
  return {
    kind: 'outbound',
    ...base,
    status: o.status === undefined ? 'queued' : oneOf(o, 'status', OUTBOUND_STATUSES),
    authorSub: strOrNull(o, 'authorSub'),
  };
}

export function parseConversationDetail(raw: unknown): ConversationDetail {
  const o = obj(raw, 'detail');
  return {
    conversation: parseHead(o.conversation),
    messages: arr(o.messages, 'messages').map(parseMessage),
  };
}

export function parseFrame(text: string): Frame | null {
  try {
    const o = obj(JSON.parse(text), 'frame');
    const seq = o.seq;
    if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) return null;
    const contact = str(o, 'contact');
    switch (o.type) {
      case 'message.inbound':
        return { seq, type: o.type, contact, messageId: str(o, 'message_id') };
      case 'message.status':
        return {
          seq,
          type: o.type,
          contact,
          clientRef: str(o, 'client_ref'),
          status: oneOf(o, 'status', OUTBOUND_STATUSES),
        };
      case 'conversation.assigned':
        return { seq, type: o.type, contact, assignee: strOrNull(o, 'assignee') };
      case 'message.outbound':
        return { seq, type: o.type, contact, clientRef: str(o, 'client_ref') };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

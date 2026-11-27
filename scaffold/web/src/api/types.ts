export type Role = 'admin' | 'agent';

export interface WorkspaceMembership {
  id: string;
  role: Role;
}

export interface User {
  sub: string;
  name: string;
  workspaces: WorkspaceMembership[];
}

export type ConversationStatus = 'open' | 'closed';

export interface ConversationSummary {
  contact: string;
  assignee: string | null;
  status: ConversationStatus;
  lastActivityAt: string;
  lastText: string | null;
}

export interface ConversationPage {
  items: ConversationSummary[];
  nextCursor: string | null;
}

export interface ConversationHead {
  contact: string;
  assignee: string | null;
  status: ConversationStatus;
}

export type OutboundStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export interface InboundMessage {
  kind: 'inbound';
  id: string;
  text: string;
  at: string;
}

export interface OutboundMessage {
  kind: 'outbound';
  /** The client_ref the reply was sent with. */
  id: string;
  text: string;
  at: string;
  status: OutboundStatus;
  authorSub: string | null;
}

export type Message = InboundMessage | OutboundMessage;

export interface ConversationDetail {
  conversation: ConversationHead;
  messages: Message[];
}

export type ConversationAction = 'claim' | 'release' | 'close' | 'reopen';

export type Frame =
  | { seq: number; type: 'message.inbound'; contact: string; messageId: string }
  | { seq: number; type: 'message.status'; contact: string; clientRef: string; status: OutboundStatus }
  | { seq: number; type: 'conversation.assigned'; contact: string; assignee: string | null }
  | { seq: number; type: 'message.outbound'; contact: string; clientRef: string };

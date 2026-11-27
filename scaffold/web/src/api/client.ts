import { parseConversationDetail, parseConversationPage, parseUser } from './parse';
import type { ConversationAction } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

let onSessionExpired: (() => void) | null = null;
let expiredReported = false;

/** Registers the one callback fired when any request answers 401. Pass null to unregister. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
  expiredReported = false;
}

async function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed: unknown = await res.json().catch(() => null);
  if (res.status === 401 && onSessionExpired && !expiredReported) {
    expiredReported = true;
    onSessionExpired();
  }
  if (!res.ok) throw new ApiError(res.status, parsed);
  return parsed;
}

const conversationPath = (contact: string) => `/api/conversations/${encodeURIComponent(contact)}`;

export const api = {
  me: async () => parseUser(await request('GET', '/api/me')),

  conversations: async (workspace: string, cursor?: string) => {
    const qs = new URLSearchParams({ workspace });
    if (cursor) qs.set('cursor', cursor);
    return parseConversationPage(await request('GET', `/api/conversations?${qs}`));
  },

  conversation: async (workspace: string, contact: string) =>
    parseConversationDetail(
      await request('GET', `${conversationPath(contact)}?${new URLSearchParams({ workspace })}`),
    ),

  reply: async (workspace: string, contact: string, text: string, clientRef: string) => {
    await request('POST', `${conversationPath(contact)}/reply`, {
      workspace,
      text,
      client_ref: clientRef,
    });
  },

  act: async (workspace: string, contact: string, action: ConversationAction) => {
    await request('POST', `${conversationPath(contact)}/${action}`, { workspace });
  },

  logout: async () => {
    await request('POST', '/auth/logout');
  },
};

/** The assignee named in a 409 from claim, if the body says so. */
export function holderFromConflict(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body;
  if (typeof body === 'object' && body !== null && 'assignee' in body) {
    const a = (body as { assignee: unknown }).assignee;
    if (typeof a === 'string') return a;
  }
  return null;
}

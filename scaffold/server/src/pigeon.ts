import { config } from './config.js';

export type SendOutcome =
  | { kind: 'accepted'; id: string | null }
  | { kind: 'rateLimited'; retryAfterMs: number }
  | { kind: 'transient' }
  | { kind: 'permanent' };

export type SendResult = { status: number; retryAfter?: string | null; id?: string | null } | { error: unknown };

const DEFAULT_RETRY_AFTER_MS = 2000;
const RETRY_AFTER_MARGIN_MS = 200;

export function classify(result: SendResult): SendOutcome {
  if ('error' in result) return { kind: 'transient' };
  const { status } = result;
  if (status >= 200 && status < 300) return { kind: 'accepted', id: result.id ?? null };
  if (status === 429) {
    const seconds = result.retryAfter ? Number(result.retryAfter) : NaN;
    return { kind: 'rateLimited', retryAfterMs: Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1000) + RETRY_AFTER_MARGIN_MS : DEFAULT_RETRY_AFTER_MS };
  }
  if (status >= 400 && status < 500) return { kind: 'permanent' };
  return { kind: 'transient' };
}

export interface SendRequest {
  workspace: string;
  to: string;
  text: string;
  clientRef: string;
}

export async function sendToPigeon({ workspace, to, text, clientRef }: SendRequest): Promise<SendOutcome> {
  try {
    const res = await fetch(`${config.pigeon.url}/v1/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.pigeon.apiKeys[workspace]}`, 'content-type': 'application/json', 'idempotency-key': clientRef },
      body: JSON.stringify({ to, text, client_ref: clientRef }),
      signal: AbortSignal.timeout(8000),
    });
    let id: string | null = null;
    if (res.ok) {
      const body: unknown = await res.json().catch(() => null);
      if (typeof body === 'object' && body !== null && typeof (body as { id?: unknown }).id === 'string') id = (body as { id: string }).id;
    } else {
      await res.body?.cancel().catch(() => {});
    }
    return classify({ status: res.status, retryAfter: res.headers.get('retry-after'), id });
  } catch (error) {
    return classify({ error });
  }
}

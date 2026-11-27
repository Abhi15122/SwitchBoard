import { createHash, createPublicKey, randomBytes, verify as verifySignature } from 'node:crypto';
import { config } from './config.js';
import type { Membership, SessionData } from './session.js';
import { isRecord, isString } from './util.js';

export class IdTokenError extends Error {}

export class IdpUnavailable extends Error {}

export interface Jwk {
  kid?: string;
  kty?: string;
  [k: string]: unknown;
}

export interface VerifyExpect {
  issuer: string;
  audience: string;
  nonce: string;
  nowSec: number;
  getKeys: (refresh: boolean) => Promise<Jwk[]>;
}

const CLOCK_SKEW_SEC = 30;

const decodePart = (part: string): unknown => {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    throw new IdTokenError('malformed token');
  }
};

export async function verifyIdToken(token: string, expect: VerifyExpect): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new IdTokenError('malformed token');
  const [head, body, sig] = parts as [string, string, string];
  const header = decodePart(head);
  const claims = decodePart(body);
  if (!isRecord(header) || !isRecord(claims)) throw new IdTokenError('malformed token');
  if (header.alg !== 'RS256' || !isString(header.kid)) throw new IdTokenError('unsupported token header');

  const find = (keys: Jwk[]) => keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
  const key = find(await expect.getKeys(false)) ?? find(await expect.getKeys(true));
  if (!key) throw new IdTokenError('unknown signing key');

  let valid = false;
  try {
    valid = verifySignature('RSA-SHA256', Buffer.from(`${head}.${body}`), createPublicKey({ key: key as never, format: 'jwk' }), Buffer.from(sig, 'base64url'));
  } catch {
    valid = false;
  }
  if (!valid) throw new IdTokenError('bad signature');

  const { iss, aud, exp, nbf, nonce, sub } = claims;
  if (iss !== expect.issuer) throw new IdTokenError('wrong issuer');
  if (!(aud === expect.audience || (Array.isArray(aud) && aud.includes(expect.audience)))) throw new IdTokenError('wrong audience');
  if (typeof exp !== 'number' || exp + CLOCK_SKEW_SEC <= expect.nowSec) throw new IdTokenError('token expired');
  if (nbf !== undefined && (typeof nbf !== 'number' || nbf - CLOCK_SKEW_SEC > expect.nowSec)) throw new IdTokenError('token not yet valid');
  if (nonce !== expect.nonce) throw new IdTokenError('wrong nonce');
  if (!isString(sub) || sub === '') throw new IdTokenError('missing subject');
  return claims;
}

export function identityFrom(claims: Record<string, unknown>): SessionData {
  const workspaces: Membership[] = [];
  if (Array.isArray(claims.workspaces)) {
    for (const w of claims.workspaces) {
      if (isRecord(w) && isString(w.id) && w.id !== '' && (w.role === 'admin' || w.role === 'agent')) workspaces.push({ id: w.id, role: w.role });
    }
  }
  const sub = claims.sub as string;
  return { sub, name: isString(claims.name) ? claims.name : sub, email: isString(claims.email) ? claims.email : '', workspaces };
}

export const newState = () => randomBytes(24).toString('base64url');
export const newVerifier = () => randomBytes(32).toString('base64url');
export const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const HTTP_TIMEOUT_MS = 8000;
let discovery: { at: number; doc: Discovery } | undefined;
let jwks: Jwk[] | undefined;
let jwksInflight: Promise<Jwk[]> | undefined;

async function idpJson(url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch {
    throw new IdpUnavailable('identity provider unreachable');
  }
}

export async function discover(): Promise<Discovery> {
  if (discovery && Date.now() - discovery.at < DISCOVERY_TTL_MS) return discovery.doc;
  const { status, body } = await idpJson(`${config.oidc.issuer}/.well-known/openid-configuration`);
  const ok = status === 200 && isRecord(body) && isString(body.authorization_endpoint) && isString(body.token_endpoint) && isString(body.jwks_uri);
  if (!ok) throw new IdpUnavailable('bad discovery document');
  discovery = { at: Date.now(), doc: body as unknown as Discovery };
  return discovery.doc;
}

export async function getKeys(refresh: boolean): Promise<Jwk[]> {
  if (jwks && !refresh) return jwks;
  jwksInflight ??= (async () => {
    try {
      const { jwks_uri } = await discover();
      const { status, body } = await idpJson(jwks_uri);
      if (status !== 200 || !isRecord(body) || !Array.isArray(body.keys)) throw new IdpUnavailable('bad jwks');
      jwks = body.keys.filter(isRecord) as Jwk[];
      return jwks;
    } finally {
      jwksInflight = undefined;
    }
  })();
  return jwksInflight;
}

export async function authorizationUrl(state: string, nonce: string, challenge: string): Promise<string> {
  const url = new URL((await discover()).authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: config.oidc.clientId,
    redirect_uri: config.oidc.redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const { token_endpoint } = await discover();
  const { status, body } = await idpJson(token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.oidc.redirectUri,
      code_verifier: verifier,
      client_id: config.oidc.clientId,
      client_secret: config.oidc.clientSecret,
    }),
  });
  if (status !== 200 || !isRecord(body) || !isString(body.id_token)) throw new IdTokenError('code exchange rejected');
  return body.id_token;
}

export const idTokenExpect = (nonce: string): VerifyExpect => ({
  issuer: config.oidc.issuer,
  audience: config.oidc.clientId,
  nonce,
  nowSec: Math.floor(Date.now() / 1000),
  getKeys,
});

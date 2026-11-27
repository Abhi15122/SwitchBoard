import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { config } from './config.js';
import { getRedis } from './redis.js';
import { isRecord, isString } from './util.js';

export type Role = 'admin' | 'agent';

export interface Membership {
  id: string;
  role: Role;
}

export interface SessionData {
  sub: string;
  name: string;
  email: string;
  workspaces: Membership[];
}

export const SESSION_COOKIE = 'sb_sid';
export const SESSION_TTL_SEC = 8 * 60 * 60;

const SESSION_ID = /^[A-Za-z0-9_-]{43}$/;
const sessionKey = (id: string) => `sb:sess:${id}`;

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name || Object.hasOwn(out, name)) continue;
    let value = part.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export interface CookieOptions {
  maxAgeSec: number;
  path: string;
}

export function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path}`, `Max-Age=${opts.maxAgeSec}`, 'HttpOnly', 'SameSite=Lax'];
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

export function sessionIdFrom(cookieHeader: string | undefined): string | null {
  const id = parseCookies(cookieHeader)[SESSION_COOKIE];
  return id !== undefined && SESSION_ID.test(id) ? id : null;
}

function parseSession(raw: string | null): SessionData | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!isRecord(v) || !isString(v.sub) || !isString(v.name) || !isString(v.email) || !Array.isArray(v.workspaces)) return null;
    return v as unknown as SessionData;
  } catch {
    return null;
  }
}

export async function createSession(data: SessionData): Promise<string> {
  const id = randomBytes(32).toString('base64url');
  await getRedis().set(sessionKey(id), JSON.stringify(data), 'EX', SESSION_TTL_SEC);
  return id;
}

export async function loadSession(id: string): Promise<SessionData | null> {
  return parseSession(await getRedis().get(sessionKey(id)));
}

export async function sessionExists(id: string): Promise<boolean> {
  return (await getRedis().exists(sessionKey(id))) === 1;
}

export async function destroySession(id: string): Promise<void> {
  await getRedis().del(sessionKey(id));
}

export async function sessionFromCookie(cookieHeader: string | undefined): Promise<SessionData | null> {
  const id = sessionIdFrom(cookieHeader);
  return id ? loadSession(id) : null;
}

export function setSessionCookie(res: Response, id: string): void {
  res.append('Set-Cookie', serializeCookie(SESSION_COOKIE, id, { maxAgeSec: SESSION_TTL_SEC, path: '/' }));
}

export function clearSessionCookie(res: Response): void {
  res.append('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAgeSec: 0, path: '/' }));
}

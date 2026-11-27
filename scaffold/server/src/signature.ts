import { createHmac, timingSafeEqual } from 'node:crypto';

export type SignatureResult = 'ok' | 'bad' | 'stale';

const TOLERANCE_SEC = 300;
const TIMESTAMP = /^\d{1,15}$/;
const SHA256_HEX = /^[0-9a-fA-F]{64}$/;

function parseHeader(header: unknown): { t: string; v1: string } | null {
  if (typeof header !== 'string') return null;
  let t: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq <= 0) return null;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') {
      if (t !== undefined) return null;
      t = value;
    } else if (key === 'v1') {
      if (v1 !== undefined) return null;
      v1 = value;
    }
  }
  if (t === undefined || v1 === undefined) return null;
  if (!TIMESTAMP.test(t) || !SHA256_HEX.test(v1)) return null;
  return { t, v1 };
}

export function verifyPigeonSignature(header: unknown, rawBody: Buffer, secret: string, nowSec: number): SignatureResult {
  try {
    const parsed = parseHeader(header);
    if (!parsed) return 'bad';
    const expected = createHmac('sha256', secret).update(`${parsed.t}.`).update(rawBody).digest();
    const given = Buffer.from(parsed.v1, 'hex');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 'bad';
    return Math.abs(nowSec - Number(parsed.t)) > TOLERANCE_SEC ? 'stale' : 'ok';
  } catch {
    return 'bad';
  }
}

import { Router, type Request, type Response } from 'express';
import { csrfGuard } from './access.js';
import { config } from './config.js';
import { authorizationUrl, challengeOf, exchangeCode, IdpUnavailable, IdTokenError, identityFrom, idTokenExpect, newState, newVerifier, verifyIdToken } from './oidc.js';
import { getRedis } from './redis.js';
import { clearSessionCookie, createSession, destroySession, parseCookies, serializeCookie, sessionIdFrom, setSessionCookie } from './session.js';
import { ah, isRecord, isString } from './util.js';

export const auth = Router();

const STATE_COOKIE = 'sb_state';
const STATE_TTL_SEC = 300;
const stateKey = (state: string) => `sb:oidc:${state}`;

const clearStateCookie = (res: Response) => res.append('Set-Cookie', serializeCookie(STATE_COOKIE, '', { maxAgeSec: 0, path: '/auth' }));

const fail = (res: Response, status: number, error: string) => {
  clearStateCookie(res);
  return res.status(status).json({ error });
};

auth.get(
  '/auth/login',
  ah(async (_req, res) => {
    const state = newState();
    const nonce = newState();
    const verifier = newVerifier();
    let location: string;
    try {
      location = await authorizationUrl(state, nonce, challengeOf(verifier));
    } catch {
      return res.status(502).json({ error: 'identity provider unavailable' });
    }
    await getRedis().set(stateKey(state), JSON.stringify({ verifier, nonce }), 'EX', STATE_TTL_SEC);
    res.append('Set-Cookie', serializeCookie(STATE_COOKIE, state, { maxAgeSec: STATE_TTL_SEC, path: '/auth' }));
    res.redirect(302, location);
  }),
);

auth.get(
  '/auth/callback',
  ah(async (req: Request, res: Response) => {
    const { code, state, error } = req.query;
    if (isString(error)) return fail(res, 400, 'login was not completed');
    if (!isString(code) || !isString(state) || code === '' || state === '') return fail(res, 400, 'missing code or state');
    if (parseCookies(req.headers.cookie)[STATE_COOKIE] !== state) return fail(res, 400, 'login state does not match this browser');

    const raw = await getRedis().getdel(stateKey(state));
    let pending: unknown;
    try {
      pending = raw ? JSON.parse(raw) : null;
    } catch {
      pending = null;
    }
    if (!isRecord(pending) || !isString(pending.verifier) || !isString(pending.nonce)) return fail(res, 400, 'login expired, start again');

    let identity;
    try {
      const idToken = await exchangeCode(code, pending.verifier);
      identity = identityFrom(await verifyIdToken(idToken, idTokenExpect(pending.nonce)));
    } catch (err) {
      if (err instanceof IdpUnavailable) return fail(res, 502, 'identity provider unavailable');
      if (err instanceof IdTokenError) return fail(res, 400, 'login could not be verified');
      throw err;
    }

    const previous = sessionIdFrom(req.headers.cookie);
    if (previous) await destroySession(previous);
    setSessionCookie(res, await createSession(identity));
    clearStateCookie(res);
    res.redirect(302, config.webOrigin);
  }),
);

auth.post(
  '/auth/logout',
  csrfGuard,
  ah(async (req, res) => {
    const id = sessionIdFrom(req.headers.cookie);
    if (id) await destroySession(id);
    clearSessionCookie(res);
    res.status(204).end();
  }),
);

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from './config.js';
import { sessionFromCookie, type Role, type SessionData } from './session.js';
import { isRecord, isString, known } from './util.js';

export interface AuthContext {
  user: SessionData;
  workspace: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      session?: SessionData;
      auth?: AuthContext;
    }
  }
}

export function memberRole(session: SessionData, workspace: unknown): Role | null {
  if (!known(config.pigeon.apiKeys, workspace)) return null;
  return session.workspaces.find((w) => w.id === workspace)?.role ?? null;
}

export function originAllowed(origin: string | undefined, ownOrigin: string): boolean {
  return origin === undefined || origin === config.webOrigin || origin === ownOrigin;
}

const ownOriginOf = (req: Request) => `${req.protocol}://${req.get('host') ?? ''}`;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfGuard: RequestHandler = (req, res, next) => {
  if (!SAFE_METHODS.has(req.method) && !originAllowed(req.get('origin'), ownOriginOf(req))) {
    res.status(403).json({ error: 'cross-origin request refused' });
    return;
  }
  next();
};

export function createAccess(load: (req: Request) => Promise<SessionData | null>) {
  const requireSession: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    load(req).then(
      (session) => {
        if (!session) {
          res.status(401).json({ error: 'sign in required' });
          return;
        }
        req.session = session;
        next();
      },
      next,
    );
  };

  const requireMember: RequestHandler = (req, res, next) => {
    requireSession(req, res, (err?: unknown) => {
      if (err || !req.session) return next(err);
      const fromQuery = req.query.workspace;
      const fromBody = isRecord(req.body) ? req.body.workspace : undefined;
      const workspace = isString(fromQuery) ? fromQuery : fromBody;
      if (!isString(workspace) || workspace === '') {
        res.status(400).json({ error: 'workspace is required' });
        return;
      }
      const role = memberRole(req.session, workspace);
      if (role === null) {
        res.status(403).json({ error: 'not a member of this workspace' });
        return;
      }
      req.auth = { user: req.session, workspace, role };
      next();
    });
  };

  return { requireSession, requireMember };
}

export const { requireSession, requireMember } = createAccess((req) => sessionFromCookie(req.headers.cookie));

import type { NextFunction, Request, Response } from 'express';

export const isString = (v: unknown): v is string => typeof v === 'string';

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const known = (map: Record<string, unknown>, key: unknown): key is string => isString(key) && Object.hasOwn(map, key);

export const ah = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

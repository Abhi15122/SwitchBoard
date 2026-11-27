import { useEffect, useRef, useState } from 'react';
import { parseFrame } from '../api/parse';
import type { Frame } from '../api/types';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting';

const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 15000;
const RESET_CLOSE_CODE = 4000;

/**
 * Keeps one WebSocket open for a workspace and hands each frame with a new seq
 * to `onFrame` once. `onResync` fires after every reconnect so callers can
 * refetch whatever a gap may have hidden.
 */
export function useFeed(workspace: string, onFrame: (frame: Frame) => void, onResync: () => void): ConnectionState {
  const [state, setState] = useState<ConnectionState>('connecting');
  const lastSeq = useRef(0);
  const handlers = useRef({ onFrame, onResync });

  useEffect(() => {
    handlers.current = { onFrame, onResync };
  });

  useEffect(() => {
    lastSeq.current = 0;
    setState('connecting');
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let wasDown = false;
    let stopped = false;

    const connect = () => {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const query = new URLSearchParams({ workspace, after: String(lastSeq.current) });
      const ws = new WebSocket(`${scheme}://${location.host}/ws?${query}`);
      socket = ws;

      ws.onopen = () => {
        attempt = 0;
        setState('live');
        if (wasDown) handlers.current.onResync();
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        const frame = parseFrame(event.data);
        if (!frame || frame.seq <= lastSeq.current) return;
        lastSeq.current = frame.seq;
        handlers.current.onFrame(frame);
      };

      ws.onclose = (event) => {
        if (stopped) return;
        if (event.code === RESET_CLOSE_CODE) lastSeq.current = 0;
        wasDown = true;
        setState('reconnecting');
        const delay = Math.min(MIN_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
        attempt += 1;
        timer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      stopped = true;
      clearTimeout(timer);
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = null;
        socket.close();
      }
    };
  }, [workspace]);

  return state;
}

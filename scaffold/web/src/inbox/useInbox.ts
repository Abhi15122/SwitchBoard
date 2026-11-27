import { useCallback, useEffect, useReducer, useState } from 'react';
import { api, holderFromConflict } from '../api/client';
import type { ConversationAction, User } from '../api/types';
import { useFeed, type ConnectionState } from '../realtime/useFeed';
import { inboxReducer, initialInbox, type InboxState } from './inboxReducer';

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface Inbox {
  state: InboxState;
  connection: ConnectionState;
  listStatus: LoadStatus;
  loadingMore: boolean;
  moreFailed: boolean;
  conversationStatus: LoadStatus;
  select: (contact: string | null) => void;
  loadMore: () => void;
  retry: () => void;
  sendReply: (text: string, clientRef: string) => Promise<void>;
  act: (action: ConversationAction) => Promise<void>;
}

const REFRESH_DEBOUNCE_MS = 150;

/** State, fetching and the live feed for one workspace. Mount it with a key of the workspace id. */
export function useInbox(workspace: string, me: User): Inbox {
  const [state, dispatch] = useReducer(inboxReducer, initialInbox);
  const [listLoaded, setListLoaded] = useState(false);
  const [listFailed, setListFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [conversationFailed, setConversationFailed] = useState(false);

  const connection = useFeed(
    workspace,
    useCallback((frame) => dispatch({ type: 'frame', frame }), []),
    useCallback(() => dispatch({ type: 'resync' }), []),
  );

  const { listRefresh, openRefresh, selected, nextCursor } = state;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      () => {
        api
          .conversations(workspace)
          .then((page) => {
            if (cancelled) return;
            dispatch({ type: 'listLoaded', page, mode: 'refresh' });
            setListLoaded(true);
            setListFailed(false);
          })
          .catch(() => {
            if (!cancelled) setListFailed(true);
          });
      },
      listRefresh === 0 ? 0 : REFRESH_DEBOUNCE_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [workspace, listRefresh]);

  useEffect(() => {
    if (selected === null) return;
    let cancelled = false;
    api
      .conversation(workspace, selected)
      .then((detail) => {
        if (cancelled) return;
        dispatch({ type: 'conversationLoaded', detail });
        setConversationFailed(false);
      })
      .catch(() => {
        if (!cancelled) setConversationFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, selected, openRefresh]);

  const select = useCallback((contact: string | null) => {
    setConversationFailed(false);
    dispatch({ type: 'select', contact });
  }, []);

  const loadMore = useCallback(() => {
    if (nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    api
      .conversations(workspace, nextCursor)
      .then((page) => dispatch({ type: 'listLoaded', page, mode: 'append' }))
      .catch(() => setMoreFailed(true))
      .finally(() => setLoadingMore(false));
  }, [workspace, nextCursor, loadingMore]);

  const retry = useCallback(() => {
    setListFailed(false);
    setConversationFailed(false);
    dispatch({ type: 'resync' });
  }, []);

  const sendReply = useCallback(
    async (text: string, clientRef: string) => {
      if (selected === null) return;
      dispatch({
        type: 'replyQueued',
        contact: selected,
        message: {
          kind: 'outbound',
          id: clientRef,
          text,
          at: new Date().toISOString(),
          status: 'queued',
          authorSub: me.sub,
        },
      });
      try {
        await api.reply(workspace, selected, text, clientRef);
      } catch (err) {
        dispatch({ type: 'replyDiscarded', contact: selected, clientRef });
        dispatch({ type: 'resync' });
        throw err;
      }
    },
    [workspace, selected, me.sub],
  );

  const act = useCallback(
    async (action: ConversationAction) => {
      if (selected === null) return;
      try {
        await api.act(workspace, selected, action);
      } catch (err) {
        if (holderFromConflict(err) !== null) dispatch({ type: 'resync' });
        throw err;
      }
      dispatch({ type: 'resync' });
    },
    [workspace, selected],
  );

  const listStatus: LoadStatus = listLoaded ? 'ready' : listFailed ? 'error' : 'loading';
  const conversationStatus: LoadStatus =
    state.open !== null ? 'ready' : conversationFailed ? 'error' : 'loading';

  return { state, connection, listStatus, loadingMore, moreFailed, conversationStatus, select, loadMore, retry, sendReply, act };
}

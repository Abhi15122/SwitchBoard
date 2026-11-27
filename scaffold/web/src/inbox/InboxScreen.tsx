import { useAuth, useSignedInUser } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { ConnectionDot } from '../components/ConnectionDot';
import { ConversationActions } from '../components/ConversationActions';
import { ConversationView } from '../components/ConversationView';
import { InboxList } from '../components/InboxList';
import { Logo } from '../components/Logo';
import { ReplyBox } from '../components/ReplyBox';
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher';
import type { Role } from '../api/types';
import { formatPhone } from '../lib/contact';
import { useInbox } from './useInbox';

/** The signed-in app for one workspace. Mount with key={workspaceId} so each workspace starts clean. */
export function InboxScreen({ workspace, role }: { workspace: string; role: Role }) {
  const user = useSignedInUser();
  const { logout } = useAuth();
  const inbox = useInbox(workspace, user);
  const { state } = inbox;
  const head = state.open?.head;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <Logo />
        <span aria-hidden className="hidden h-6 w-px bg-slate-200 sm:block" />
        <WorkspaceSwitcher />
        <ConnectionDot state={inbox.connection} />
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-2">
            <Avatar label={user.name} size="sm" />
            <span className="hidden text-sm font-medium text-slate-700 sm:inline">{user.name}</span>
          </span>
          <button type="button" onClick={() => void logout()} className="btn btn-ghost">
            Sign out
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${state.selected ? 'hidden md:flex' : 'flex'} w-full flex-col border-r border-slate-200 bg-white md:w-96 md:shrink-0`}
        >
          <InboxList
            items={state.list}
            selected={state.selected}
            status={inbox.listStatus}
            meSub={user.sub}
            hasMore={state.nextCursor !== null}
            loadingMore={inbox.loadingMore}
            moreFailed={inbox.moreFailed}
            onSelect={inbox.select}
            onLoadMore={inbox.loadMore}
            onRetry={inbox.retry}
          />
        </aside>

        <main className={`${state.selected ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-white`}>
          {state.selected === null ? (
            <div className="m-auto max-w-xs p-6 text-center">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-2xl">📥</span>
              <p className="font-semibold text-slate-800">Pick a conversation</p>
              <p className="mt-1 text-sm text-slate-500">Claim it so teammates know you're on it, then reply. Everything updates live.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 px-4 py-3">
                <button
                  type="button"
                  onClick={() => inbox.select(null)}
                  aria-label="Back to conversations"
                  className="btn btn-ghost -ml-2 px-2 md:hidden"
                >
                  ←
                </button>
                <Avatar label={state.selected} />
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-slate-900 tabular-nums">{formatPhone(state.selected)}</h2>
                  {head && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      {head.status === 'closed' ? (
                        <span className="chip bg-slate-100 text-slate-600">Closed</span>
                      ) : (
                        <span className="chip bg-emerald-50 text-emerald-700">Open</span>
                      )}
                      {head.assignee !== null ? (
                        <span className={`chip ${head.assignee === user.sub ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                          Assigned to {head.assignee === user.sub ? 'you' : head.assignee}
                        </span>
                      ) : (
                        head.status === 'open' && <span className="chip bg-amber-50 text-amber-700">Unassigned</span>
                      )}
                    </p>
                  )}
                </div>
                {head && (
                  <div className="ml-auto">
                    <ConversationActions key={state.selected} head={head} meSub={user.sub} role={role} onAct={inbox.act} />
                  </div>
                )}
              </div>

              {inbox.conversationStatus === 'loading' && (
                <div aria-hidden className="flex-1 space-y-3 bg-slate-50 p-8">
                  {['w-1/2', 'ml-auto w-2/5', 'w-1/3'].map((w, i) => (
                    <div key={i} className={`h-12 animate-pulse rounded-2xl bg-slate-200 ${w}`} />
                  ))}
                </div>
              )}
              {inbox.conversationStatus === 'error' && (
                <div role="alert" className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <p className="font-medium">Could not load this conversation.</p>
                  <button type="button" onClick={inbox.retry} className="btn btn-secondary mt-3">
                    Try again
                  </button>
                </div>
              )}
              {state.open && (
                <>
                  <ConversationView messages={state.open.messages} meSub={user.sub} />
                  <ReplyBox key={state.selected} onSend={inbox.sendReply} closed={state.open.head.status === 'closed'} />
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

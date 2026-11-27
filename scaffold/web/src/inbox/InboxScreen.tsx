import { useAuth, useSignedInUser } from '../auth/AuthProvider';
import { ConnectionDot } from '../components/ConnectionDot';
import { ConversationActions } from '../components/ConversationActions';
import { ConversationView } from '../components/ConversationView';
import { InboxList } from '../components/InboxList';
import { ReplyBox } from '../components/ReplyBox';
import { WorkspaceSwitcher } from '../components/WorkspaceSwitcher';
import type { Role } from '../api/types';
import { useInbox } from './useInbox';

/** The signed-in app for one workspace. Mount with key={workspaceId} so each workspace starts clean. */
export function InboxScreen({ workspace, role }: { workspace: string; role: Role }) {
  const user = useSignedInUser();
  const { logout } = useAuth();
  const inbox = useInbox(workspace, user);
  const { state } = inbox;

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="text-lg font-semibold">Switchboard</h1>
        <WorkspaceSwitcher />
        <ConnectionDot state={inbox.connection} />
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-slate-600">{user.name}</span>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${state.selected ? 'hidden md:flex' : 'flex'} w-full flex-col border-r border-slate-200 bg-white md:w-80 md:shrink-0`}
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

        <main className={`${state.selected ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
          {state.selected === null ? (
            <p className="m-auto p-6 text-slate-500">Select a conversation to read and reply.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-2">
                <button
                  type="button"
                  onClick={() => inbox.select(null)}
                  aria-label="Back to conversations"
                  className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50 md:hidden"
                >
                  Back
                </button>
                <h2 className="font-medium">{state.selected}</h2>
                {state.open && (
                  <>
                    {state.open.head.status === 'closed' && (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">Closed</span>
                    )}
                    {state.open.head.assignee !== null && (
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-800">
                        {state.open.head.assignee === user.sub ? 'You' : state.open.head.assignee}
                      </span>
                    )}
                    <div className="ml-auto">
                      <ConversationActions
                        key={state.selected}
                        head={state.open.head}
                        meSub={user.sub}
                        role={role}
                        onAct={inbox.act}
                      />
                    </div>
                  </>
                )}
              </div>

              {inbox.conversationStatus === 'loading' && (
                <p className="flex-1 p-6 text-sm text-slate-500">Loading messages...</p>
              )}
              {inbox.conversationStatus === 'error' && (
                <div role="alert" className="flex-1 p-6 text-sm text-red-700">
                  <p>Could not load this conversation.</p>
                  <button type="button" onClick={inbox.retry} className="mt-2 rounded border border-red-300 px-3 py-1 hover:bg-red-50">
                    Try again
                  </button>
                </div>
              )}
              {state.open && (
                <>
                  <ConversationView messages={state.open.messages} />
                  <ReplyBox key={state.selected} onSend={inbox.sendReply} />
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './auth/LoginScreen';
import { InboxScreen } from './inbox/InboxScreen';

function Gate() {
  const { state, workspace, logout } = useAuth();

  if (state.status === 'loading') {
    return <p className="p-6 text-slate-500">Loading...</p>;
  }
  if (state.status === 'anonymous') {
    return <LoginScreen expired={state.expired} error={state.error} />;
  }
  if (!workspace) {
    return (
      <main className="p-6">
        <p>Your account is not a member of any workspace yet. Ask an admin to add you.</p>
        <button type="button" onClick={() => void logout()} className="mt-3 rounded border border-slate-300 px-3 py-1">
          Sign out
        </button>
      </main>
    );
  }
  return <InboxScreen key={workspace.id} workspace={workspace.id} role={workspace.role} />;
}

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

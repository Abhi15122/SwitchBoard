import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './auth/LoginScreen';
import { Logo } from './components/Logo';
import { InboxScreen } from './inbox/InboxScreen';

function Gate() {
  const { state, workspace, logout } = useAuth();

  if (state.status === 'loading') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4" role="status">
        <Logo />
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }
  if (state.status === 'anonymous') {
    return <LoginScreen expired={state.expired} error={state.error} />;
  }
  if (!workspace) {
    return (
      <main className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Logo />
          <p className="mt-4 text-sm text-slate-600">Your account is not a member of any workspace yet. Ask an admin to add you.</p>
          <button type="button" onClick={() => void logout()} className="btn btn-secondary mt-5">
            Sign out
          </button>
        </div>
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

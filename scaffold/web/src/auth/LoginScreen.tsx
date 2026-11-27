import { Logo } from '../components/Logo';

export function LoginScreen({ expired, error }: { expired: boolean; error: boolean }) {
  return (
    <main className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-50 via-slate-50 to-emerald-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
        <div className="flex justify-center">
          <Logo size={36} />
        </div>
        <h1 className="mt-6 text-center text-xl font-semibold text-slate-900">Welcome back</h1>
        <p className="mt-1 text-center text-sm text-slate-500">The shared inbox for your support team.</p>
        {expired && (
          <p role="alert" className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            Your session expired. Sign in again to continue.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
            Could not reach the server. Try signing in again.
          </p>
        )}
        <a href="/auth/login" className="btn btn-primary mt-6 w-full py-2.5">
          Sign in with your company account
        </a>
        <ul className="mt-6 space-y-1.5 border-t border-slate-100 pt-5 text-xs text-slate-500">
          <li>✓ Conversations arrive in real time</li>
          <li>✓ Claim a conversation so nobody replies twice</li>
          <li>✓ Every reply shows queued, sent, delivered or failed</li>
        </ul>
      </div>
    </main>
  );
}

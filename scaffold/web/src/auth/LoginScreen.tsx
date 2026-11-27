export function LoginScreen({ expired, error }: { expired: boolean; error: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Switchboard</h1>
        <p className="mt-2 text-sm text-slate-600">The shared inbox for your support team.</p>
        {expired && (
          <p role="alert" className="mt-4 rounded bg-amber-50 p-2 text-sm text-amber-800">
            Your session expired. Sign in again to continue.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded bg-red-50 p-2 text-sm text-red-800">
            Could not reach the server. Try signing in again.
          </p>
        )}
        <a
          href="/auth/login"
          className="mt-6 inline-block w-full rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-600"
        >
          Sign in
        </a>
      </div>
    </main>
  );
}

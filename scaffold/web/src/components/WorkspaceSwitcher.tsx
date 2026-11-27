import { useAuth, useSignedInUser } from '../auth/AuthProvider';

const pretty = (id: string) => id.replace(/^ws_/, '').replace(/^\w/, (c) => c.toUpperCase());

export function WorkspaceSwitcher() {
  const { workspace, selectWorkspace } = useAuth();
  const { workspaces } = useSignedInUser();
  if (!workspace) return null;

  const role = <span className="chip bg-slate-100 text-slate-600 capitalize">{workspace.role}</span>;

  if (workspaces.length < 2) {
    return (
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{pretty(workspace.id)}</span>
        {role}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <select
        aria-label="Workspace"
        value={workspace.id}
        onChange={(e) => selectWorkspace(e.target.value)}
        className="rounded-md border border-slate-300 bg-white py-1 pr-7 pl-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {pretty(w.id)}
          </option>
        ))}
      </select>
      {role}
    </span>
  );
}

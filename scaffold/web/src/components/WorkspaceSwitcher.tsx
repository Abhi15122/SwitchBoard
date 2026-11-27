import { useAuth, useSignedInUser } from '../auth/AuthProvider';

export function WorkspaceSwitcher() {
  const { workspace, selectWorkspace } = useAuth();
  const { workspaces } = useSignedInUser();
  if (!workspace) return null;

  if (workspaces.length < 2) {
    return <span className="text-sm font-medium text-slate-700">{workspace.id}</span>;
  }
  return (
    <select
      aria-label="Workspace"
      value={workspace.id}
      onChange={(e) => selectWorkspace(e.target.value)}
      className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
    >
      {workspaces.map((w) => (
        <option key={w.id} value={w.id}>
          {w.id} ({w.role})
        </option>
      ))}
    </select>
  );
}

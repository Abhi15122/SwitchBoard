import { appendFrame } from './feed.js';
import { cols, statusRank, type OutStatus } from './store.js';

export async function advanceStatus(workspace: string, clientRef: string, status: string): Promise<void> {
  const rank = statusRank(status);
  if (status === 'queued' || rank === undefined) return;
  const { outbound } = await cols();
  const moved = await outbound.findOneAndUpdate(
    { workspace, clientRef, statusRank: { $lt: rank } },
    { $set: { status: status as OutStatus, statusRank: rank } },
    { returnDocument: 'after' },
  );
  const doc = moved ?? (await outbound.findOne({ workspace, clientRef }));
  if (!doc || doc.status !== status) return;
  await appendFrame(workspace, `st:${clientRef}:${status}`, { type: 'message.status', contact: doc.contact, client_ref: clientRef, status: doc.status });
}

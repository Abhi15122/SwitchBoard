import { getRedis } from './redis.js';
import { cols, isDuplicateKey, retryDuplicate, type Frame } from './store.js';

type WithoutSeq<T> = T extends unknown ? Omit<T, 'seq'> : never;
type FrameBody = WithoutSeq<Frame>;

export const feedChannel = (workspace: string) => `sb:feed:${workspace}`;

export async function appendFrame(workspace: string, dedupeKey: string, body: FrameBody): Promise<void> {
  const { feed, counters } = await cols();
  if (await feed.findOne({ workspace, dedupeKey }, { projection: { _id: 1 } })) return;

  const counter = await retryDuplicate(() =>
    counters.findOneAndUpdate({ _id: workspace }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' }),
  );
  if (!counter) throw new Error('counter upsert returned nothing');
  const frame = { seq: counter.seq, ...body } as Frame;

  try {
    await feed.insertOne({ workspace, seq: frame.seq, dedupeKey, frame, createdAt: new Date() });
  } catch (err) {
    if (isDuplicateKey(err) && err.keyPattern?.dedupeKey) return;
    throw err;
  }
  getRedis()
    .publish(feedChannel(workspace), String(frame.seq))
    .catch(() => {});
}

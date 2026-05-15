import type { ServerSentEvent } from '@shared/types';

type Listener = (sse: ServerSentEvent) => void;
const channels = new Map<string, Set<Listener>>();

export const subscribe = (projectId: string, fn: Listener): (() => void) => {
  let set = channels.get(projectId);
  if (!set) {
    set = new Set();
    channels.set(projectId, set);
  }
  set.add(fn);
  return () => set!.delete(fn);
};

export const publish = (projectId: string, sse: ServerSentEvent): void => {
  const set = channels.get(projectId);
  if (!set) return;
  for (const fn of set) fn(sse);
};

import type { NodeChange } from 'reactflow';
import { ROOT_NODE_ID } from '@shared/types';

export const removableNodeIdsFromChanges = (changes: ReadonlyArray<NodeChange>): string[] => {
  const ids = new Set<string>();
  for (const change of changes) {
    if (change.type === 'remove' && change.id !== ROOT_NODE_ID) ids.add(change.id);
  }
  return [...ids];
};

export const nodeChangesWithoutBlockedDeletes = (changes: ReadonlyArray<NodeChange>): NodeChange[] =>
  changes.filter((change) => !(change.type === 'remove' && change.id === ROOT_NODE_ID));

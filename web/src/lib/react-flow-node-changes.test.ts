import { describe, expect, test } from 'bun:test';
import type { NodeChange } from 'reactflow';
import { ROOT_NODE_ID } from '@shared/types';
import { nodeChangesWithoutBlockedDeletes, removableNodeIdsFromChanges } from './react-flow-node-changes';

const remove = (id: string): NodeChange => ({ type: 'remove', id });
const select = (id: string): NodeChange => ({ type: 'select', id, selected: true });

describe('react flow node change mapping', () => {
  test('extracts unique non-root node removals for the tree store', () => {
    const changes = [remove('a'), remove(ROOT_NODE_ID), remove('a'), remove('b'), select('c')];

    expect(removableNodeIdsFromChanges(changes)).toEqual(['a', 'b']);
  });

  test('blocks local root deletion while keeping other canvas changes', () => {
    const changes = [select(ROOT_NODE_ID), remove(ROOT_NODE_ID), remove('a')];

    expect(nodeChangesWithoutBlockedDeletes(changes)).toEqual([select(ROOT_NODE_ID), remove('a')]);
  });
});

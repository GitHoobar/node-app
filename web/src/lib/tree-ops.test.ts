import { describe, expect, test } from 'bun:test';
import type { TreeNode } from '@shared/types';
import { APP_ROOT_NAME, ROOT_NODE_ID } from '@shared/types';
import { deleteNode, deleteNodes, flattenWithParent, reparent } from './tree-ops';

const makeTree = (): TreeNode => ({
  id: ROOT_NODE_ID,
  name: APP_ROOT_NAME,
  prompt: '',
  children: [
    {
      id: 'a',
      name: 'A',
      prompt: 'a',
      children: [
        { id: 'a1', name: 'A1', prompt: 'a1', children: [] },
        { id: 'a2', name: 'A2', prompt: 'a2', children: [] },
      ],
    },
    { id: 'b', name: 'B', prompt: 'b', children: [] },
  ],
});

const ids = (tree: TreeNode) => flattenWithParent(tree).map(({ node }) => node.id);

describe('tree delete operations', () => {
  test('deletes a leaf node without mutating the original tree', () => {
    const tree = makeTree();
    const next = deleteNode(tree, 'a1');

    expect(ids(next)).toEqual([ROOT_NODE_ID, 'a', 'a2', 'b']);
    expect(ids(tree)).toEqual([ROOT_NODE_ID, 'a', 'a1', 'a2', 'b']);
  });

  test('deletes an entire subtree', () => {
    const next = deleteNode(makeTree(), 'a');

    expect(ids(next)).toEqual([ROOT_NODE_ID, 'b']);
  });

  test('deletes multiple nodes and ignores root deletes', () => {
    const next = deleteNodes(makeTree(), [ROOT_NODE_ID, 'a1', 'b', 'a1']);

    expect(ids(next)).toEqual([ROOT_NODE_ID, 'a', 'a2']);
  });

  test('does not delete the root node', () => {
    const tree = makeTree();
    const next = deleteNode(tree, ROOT_NODE_ID);

    expect(next).toBe(tree);
    expect(ids(next)).toEqual([ROOT_NODE_ID, 'a', 'a1', 'a2', 'b']);
  });
});

describe('tree reparent operations', () => {
  test('moves a node from its old parent to the new parent', () => {
    const next = reparent(makeTree(), 'a2', 'b');

    expect(next).not.toBeNull();
    expect(next!.children[0]!.children.map((child) => child.id)).toEqual(['a1']);
    expect(next!.children[1]!.children.map((child) => child.id)).toEqual(['a2']);
  });

  test('rejects root moves and cycle-creating moves', () => {
    expect(reparent(makeTree(), ROOT_NODE_ID, 'b')).toBeNull();
    expect(reparent(makeTree(), 'a', 'a1')).toBeNull();
  });
});

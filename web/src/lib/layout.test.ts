import { describe, expect, test } from 'bun:test';
import type { TreeNode } from '@shared/types';
import { APP_ROOT_NAME, ROOT_NODE_ID } from '@shared/types';
import { layoutObsidianTree } from './layout';

const makeTree = (): TreeNode => ({
  id: ROOT_NODE_ID,
  name: APP_ROOT_NAME,
  prompt: '',
  children: [
    {
      id: 'a',
      name: 'A',
      prompt: 'a',
      children: [{ id: 'a1', name: 'A1', prompt: 'a1', children: [] }],
    },
    { id: 'b', name: 'B', prompt: 'b', children: [] },
  ],
});

describe('layoutObsidianTree', () => {
  test('creates a read-only vertical hierarchy with node metadata', () => {
    const { nodes, edges } = layoutObsidianTree(makeTree());
    const byId = new Map(nodes.map((node) => [node.id, node]));

    expect(nodes.map((node) => node.id)).toEqual([ROOT_NODE_ID, 'a', 'a1', 'b']);
    expect(edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([`${ROOT_NODE_ID}->a`, 'a->a1', `${ROOT_NODE_ID}->b`]);
    expect(nodes.every((node) => node.type === 'obsidianTree')).toBe(true);
    expect(nodes.every((node) => node.draggable === false)).toBe(true);
    expect(nodes.every((node) => node.connectable === false)).toBe(true);

    expect(byId.get(ROOT_NODE_ID)!.position.y).toBeLessThan(byId.get('a')!.position.y);
    expect(byId.get('a')!.position.y).toBeLessThan(byId.get('a1')!.position.y);
    expect(byId.get('a')!.data.depth).toBe(1);
    expect(byId.get('a')!.data.childCount).toBe(1);
  });
});

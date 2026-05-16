import { beforeEach, describe, expect, test } from 'bun:test';
import type { Project, TreeNode } from '@shared/types';
import { APP_ROOT_NAME, ROOT_NODE_ID } from '@shared/types';
import { useApp } from './store';
import { flattenWithParent } from './lib/tree-ops';

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

const makeProject = (tree = makeTree()): Project => ({
  id: 'project-1',
  name: 'Project',
  sandboxId: null,
  codexThreadId: null,
  capabilityToken: 'token',
  tree,
  previewUrl: null,
  updatedAt: 1,
});

const ids = (tree: TreeNode | null) => (tree ? flattenWithParent(tree).map(({ node }) => node.id) : []);

beforeEach(() => {
  useApp.setState({
    project: null,
    tree: null,
    selectedNodeId: ROOT_NODE_ID,
    previewUrl: null,
    previewKey: 0,
    events: [],
    generating: false,
    codexConnected: false,
    loginModalOpen: false,
    bootstrap: 'unknown',
    runStatus: { phase: 'idle', message: '' },
  });
});

describe('app tree store', () => {
  test('loads the selected project tree as the editable tree', () => {
    const project = makeProject();

    useApp.getState().setProject(project);

    expect(useApp.getState().project).toEqual(project);
    expect(useApp.getState().tree).toEqual(project.tree);
    expect(useApp.getState().selectedNodeId).toBe(ROOT_NODE_ID);
  });

  test('updates project sandbox metadata without replacing local tree edits', () => {
    const project = makeProject();
    useApp.getState().setProject(project);
    useApp.getState().applyUpdate(ROOT_NODE_ID, { prompt: 'unsaved local prompt' });

    useApp.getState().updateProjectMetadata({
      ...project,
      sandboxId: 'sandbox-123456',
      previewUrl: 'https://preview.example',
      updatedAt: 2,
      tree: { ...project.tree, prompt: 'server prompt' },
    });

    const state = useApp.getState();
    expect(state.project!.sandboxId).toBe('sandbox-123456');
    expect(state.project!.previewUrl).toBe('https://preview.example');
    expect(state.previewUrl).toBe('https://preview.example');
    expect(state.tree!.prompt).toBe('unsaved local prompt');
  });

  test('deletes canvas-selected nodes from the canonical tree before saving', () => {
    useApp.getState().setProject(makeProject());
    useApp.getState().select('a1');

    useApp.getState().applyDeleteMany(['a']);

    const state = useApp.getState();
    expect(ids(state.tree)).toEqual([ROOT_NODE_ID, 'b']);
    expect(state.selectedNodeId).toBe(ROOT_NODE_ID);
  });

  test('handles multi-select deletes and ignores root delete requests', () => {
    useApp.getState().setProject(makeProject());

    useApp.getState().applyDeleteMany([ROOT_NODE_ID, 'a1', 'b']);

    expect(ids(useApp.getState().tree)).toEqual([ROOT_NODE_ID, 'a']);
  });

  test('reparents only valid moves', () => {
    useApp.getState().setProject(makeProject());

    expect(useApp.getState().applyReparent('a1', 'b')).toBe(true);
    expect(useApp.getState().tree!.children[0]!.children).toEqual([]);
    expect(useApp.getState().tree!.children[1]!.children.map((child) => child.id)).toEqual(['a1']);
    expect(useApp.getState().applyReparent(ROOT_NODE_ID, 'b')).toBe(false);
  });

  test('replaces the canonical tree from JSON edits and keeps valid selection', () => {
    useApp.getState().setProject(makeProject());
    useApp.getState().select('b');

    const nextTree: TreeNode = {
      id: ROOT_NODE_ID,
      name: APP_ROOT_NAME,
      prompt: 'next',
      children: [{ id: 'b', name: 'B updated', prompt: 'updated', children: [] }],
    };

    useApp.getState().replaceTree(nextTree);

    expect(useApp.getState().tree).toEqual(nextTree);
    expect(useApp.getState().selectedNodeId).toBe('b');
  });

  test('resets selection when JSON edits remove the selected node', () => {
    useApp.getState().setProject(makeProject());
    useApp.getState().select('a1');

    useApp.getState().replaceTree({
      id: ROOT_NODE_ID,
      name: APP_ROOT_NAME,
      prompt: 'next',
      children: [{ id: 'b', name: 'B', prompt: 'b', children: [] }],
    });

    expect(useApp.getState().selectedNodeId).toBe(ROOT_NODE_ID);
  });
});

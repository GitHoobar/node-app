import type { TreeNode } from '@shared/types';
import { ROOT_NODE_ID } from '@shared/types';

const newId = (): string => 'n_' + Math.random().toString(36).slice(2, 10);

const cloneTree = (n: TreeNode): TreeNode => ({
  id: n.id,
  name: n.name,
  prompt: n.prompt,
  children: n.children.map(cloneTree),
});

const findParent = (root: TreeNode, id: string): TreeNode | null => {
  for (const c of root.children) {
    if (c.id === id) return root;
    const p = findParent(c, id);
    if (p) return p;
  }
  return null;
};

const findNode = (root: TreeNode, id: string): TreeNode | null => {
  if (root.id === id) return root;
  for (const c of root.children) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
};

const descendantIds = (n: TreeNode): Set<string> => {
  const set = new Set<string>([n.id]);
  for (const c of n.children) for (const d of descendantIds(c)) set.add(d);
  return set;
};

export const addChild = (root: TreeNode, parentId: string): TreeNode => {
  const next = cloneTree(root);
  const parent = findNode(next, parentId);
  if (!parent) return next;
  parent.children.push({ id: newId(), name: 'Untitled', prompt: '', children: [] });
  return next;
};

export const updateNode = (
  root: TreeNode,
  id: string,
  patch: Partial<Pick<TreeNode, 'name' | 'prompt'>>,
): TreeNode => {
  const next = cloneTree(root);
  const n = findNode(next, id);
  if (!n) return next;
  if (patch.name !== undefined) n.name = patch.name;
  if (patch.prompt !== undefined) n.prompt = patch.prompt;
  return next;
};

export const deleteNodes = (root: TreeNode, ids: ReadonlyArray<string>): TreeNode => {
  const idsToDelete = new Set(ids.filter((id) => id !== ROOT_NODE_ID));
  if (idsToDelete.size === 0) return root;

  const prune = (node: TreeNode): TreeNode => ({
    ...node,
    children: node.children.filter((child) => !idsToDelete.has(child.id)).map(prune),
  });

  return prune(root);
};

export const deleteNode = (root: TreeNode, id: string): TreeNode => deleteNodes(root, [id]);

export const reparent = (root: TreeNode, sourceId: string, targetId: string): TreeNode | null => {
  if (sourceId === ROOT_NODE_ID || sourceId === targetId) return null;
  const next = cloneTree(root);
  const source = findNode(next, sourceId);
  const target = findNode(next, targetId);
  if (!source || !target) return null;
  if (descendantIds(source).has(targetId)) return null;
  const parent = findParent(next, sourceId);
  if (!parent) return null;
  parent.children = parent.children.filter((c) => c.id !== sourceId);
  target.children.push(source);
  return next;
};

export const flattenWithParent = (root: TreeNode): Array<{ node: TreeNode; parentId: string | null }> => {
  const out: Array<{ node: TreeNode; parentId: string | null }> = [];
  const walk = (n: TreeNode, parentId: string | null): void => {
    out.push({ node: n, parentId });
    for (const c of n.children) walk(c, n.id);
  };
  walk(root, null);
  return out;
};

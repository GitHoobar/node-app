import type { TreeNode } from '@shared/types';
import { ROOT_NODE_ID } from '@shared/types';

type ParseTreeJsonResult = { ok: true; tree: TreeNode } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validateTreeNode = (value: unknown, path: string, seen: Set<string>): ParseTreeJsonResult => {
  if (!isRecord(value)) return { ok: false, error: `${path} must be an object` };

  const { id, name, prompt, children } = value;
  if (typeof id !== 'string' || id.trim() === '') {
    return { ok: false, error: `${path}.id must be a non-empty string` };
  }
  if (seen.has(id)) return { ok: false, error: `duplicate node id "${id}"` };
  seen.add(id);
  if (typeof name !== 'string') return { ok: false, error: `${path}.name must be a string` };
  if (typeof prompt !== 'string') return { ok: false, error: `${path}.prompt must be a string` };
  if (!Array.isArray(children)) return { ok: false, error: `${path}.children must be an array` };

  const parsedChildren: TreeNode[] = [];
  for (let index = 0; index < children.length; index += 1) {
    const child = validateTreeNode(children[index], `${path}.children[${index}]`, seen);
    if (!child.ok) return child;
    parsedChildren.push(child.tree);
  }

  return { ok: true, tree: { id, name, prompt, children: parsedChildren } };
};

export const parseTreeJson = (value: string): ParseTreeJsonResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    return { ok: false, error: error instanceof SyntaxError ? error.message : 'Invalid JSON' };
  }

  const result = validateTreeNode(parsed, 'root', new Set());
  if (!result.ok) return result;
  if (result.tree.id !== ROOT_NODE_ID) return { ok: false, error: `root.id must be "${ROOT_NODE_ID}"` };

  return { ok: true, tree: result.tree };
};

export const formatTreeJson = (tree: TreeNode): string => JSON.stringify(tree, null, 2);

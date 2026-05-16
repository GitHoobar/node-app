import dagre from 'dagre';
import { Position } from 'reactflow';
import type { Edge, Node } from 'reactflow';
import type { TreeNode } from '@shared/types';
import { flattenWithParent } from './tree-ops';

const NODE_WIDTH = 224;
const NODE_HEIGHT = 80;
const OBSIDIAN_NODE_WIDTH = 172;
const OBSIDIAN_NODE_HEIGHT = 42;

export type ObsidianTreeNodeData = {
  tree: TreeNode;
  depth: number;
  childCount: number;
};

const flattenWithDepth = (root: TreeNode): Array<{ node: TreeNode; parentId: string | null; depth: number }> => {
  const out: Array<{ node: TreeNode; parentId: string | null; depth: number }> = [];
  const walk = (node: TreeNode, parentId: string | null, depth: number): void => {
    out.push({ node, parentId, depth });
    for (const child of node.children) walk(child, node.id, depth + 1);
  };
  walk(root, null, 0);
  return out;
};

export const layoutTree = (root: TreeNode): { nodes: Node[]; edges: Edge[] } => {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  const flat = flattenWithParent(root);
  for (const { node } of flat) g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const { node, parentId } of flat) if (parentId) g.setEdge(parentId, node.id);

  dagre.layout(g);

  const nodes: Node[] = flat.map(({ node }) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      type: 'page',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: { tree: node },
      draggable: node.id !== 'root',
    };
  });

  const edges: Edge[] = flat
    .filter((f) => f.parentId)
    .map(({ node, parentId }) => ({
      id: `${parentId}->${node.id}`,
      source: parentId!,
      target: node.id,
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#52525b' },
    }));

  return { nodes, edges };
};

export const layoutObsidianTree = (root: TreeNode): { nodes: Node<ObsidianTreeNodeData>[]; edges: Edge[] } => {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: 64, ranksep: 86, marginx: 56, marginy: 56 });
  g.setDefaultEdgeLabel(() => ({}));

  const flat = flattenWithDepth(root);
  for (const { node } of flat) g.setNode(node.id, { width: OBSIDIAN_NODE_WIDTH, height: OBSIDIAN_NODE_HEIGHT });
  for (const { node, parentId } of flat) if (parentId) g.setEdge(parentId, node.id);

  dagre.layout(g);

  const nodes: Node<ObsidianTreeNodeData>[] = flat.map(({ node, depth }) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      type: 'obsidianTree',
      position: { x: pos.x - OBSIDIAN_NODE_WIDTH / 2, y: pos.y - OBSIDIAN_NODE_HEIGHT / 2 },
      data: { tree: node, depth, childCount: node.children.length },
      draggable: false,
      connectable: false,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    };
  });

  const edges: Edge[] = flat
    .filter((f) => f.parentId)
    .map(({ node, parentId }) => ({
      id: `obsidian:${parentId}->${node.id}`,
      source: parentId!,
      target: node.id,
      type: 'smoothstep',
      animated: false,
      focusable: false,
      selectable: false,
      style: { stroke: '#3f3f46', strokeWidth: 1.6 },
    }));

  return { nodes, edges };
};

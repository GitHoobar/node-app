import dagre from 'dagre';
import type { Edge, Node } from 'reactflow';
import type { TreeNode } from '@shared/types';
import { flattenWithParent } from './tree-ops';

const NODE_WIDTH = 224;
const NODE_HEIGHT = 80;

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

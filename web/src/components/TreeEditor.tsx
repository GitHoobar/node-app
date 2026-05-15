import { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeMouseHandler,
} from 'reactflow';
import { useApp } from '../store';
import { layoutTree } from '../lib/layout';
import { PageNode } from './PageNode';

const nodeTypes = { page: PageNode };

const Inner = () => {
  const tree = useApp((s) => s.tree);
  const selectedNodeId = useApp((s) => s.selectedNodeId);
  const select = useApp((s) => s.select);
  const applyReparent = useApp((s) => s.applyReparent);
  const { getIntersectingNodes } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!tree) return;
    const laid = layoutTree(tree);
    setNodes(laid.nodes);
    setEdges(laid.edges);
  }, [tree, setNodes, setEdges]);

  const decoratedNodes = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedNodeId })),
    [nodes, selectedNodeId],
  );

  const onNodeClick: NodeMouseHandler = useCallback((_e, n) => select(n.id), [select]);

  const onNodeDragStop: NodeMouseHandler = useCallback(
    (_e, dragged: Node) => {
      const target = getIntersectingNodes(dragged).find((n) => n.id !== dragged.id);
      if (!target) return;
      applyReparent(dragged.id, target.id);
    },
    [getIntersectingNodes, applyReparent],
  );

  return (
    <ReactFlow
      nodes={decoratedNodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      nodesConnectable={false}
      edgesFocusable={false}
      onNodeClick={onNodeClick}
      onNodeDragStop={onNodeDragStop}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#27272a" gap={16} />
      <Controls className="!bg-zinc-900 !border-zinc-800" />
    </ReactFlow>
  );
};

export const TreeEditor = () => (
  <ReactFlowProvider>
    <Inner />
  </ReactFlowProvider>
);

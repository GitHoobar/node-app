import { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
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
  const appendEvent = useApp((s) => s.appendEvent);
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

  // primary reparent gesture: drag a wire from a node's bottom handle
  // to another node's top handle (= onConnect)
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      // user drags from PARENT-to-be (source) to CHILD (target)
      // so the dragged "target" of the connection becomes a child of "source"
      const ok = applyReparent(c.target, c.source);
      appendEvent({
        type: 'log',
        level: ok ? 'info' : 'warn',
        message: ok ? `reparented ${c.target} → child of ${c.source}` : `reparent rejected (cycle or root)`,
      } as any);
    },
    [applyReparent, appendEvent],
  );

  // fallback: drag a node body and drop it onto another node
  const onNodeDragStop: NodeMouseHandler = useCallback(
    (_e, dragged: Node) => {
      const overlapping = getIntersectingNodes(dragged).filter((n) => n.id !== dragged.id);
      if (overlapping.length === 0) return;
      const ok = applyReparent(dragged.id, overlapping[0]!.id);
      appendEvent({
        type: 'log',
        level: ok ? 'info' : 'warn',
        message: ok ? `reparented ${dragged.id} → child of ${overlapping[0]!.id}` : 'reparent rejected (cycle or root)',
      } as any);
    },
    [getIntersectingNodes, applyReparent, appendEvent],
  );

  return (
    <ReactFlow
      nodes={decoratedNodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      nodesConnectable
      edgesFocusable={false}
      onNodeClick={onNodeClick}
      onNodeDragStop={onNodeDragStop}
      onConnect={onConnect}
      defaultEdgeOptions={{ type: 'smoothstep', style: { stroke: '#52525b' } }}
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

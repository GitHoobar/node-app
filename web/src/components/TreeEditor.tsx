import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitBranch, Network } from 'lucide-react';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
} from 'reactflow';
import { useApp } from '../store';
import { layoutObsidianTree, layoutTree } from '../lib/layout';
import { nodeChangesWithoutBlockedDeletes, removableNodeIdsFromChanges } from '../lib/react-flow-node-changes';
import { ObsidianTreeNode } from './ObsidianTreeNode';
import { PageNode } from './PageNode';

type TreeViewMode = 'editor' | 'obsidian';

const editorNodeTypes = { page: PageNode };
const obsidianNodeTypes = { obsidianTree: ObsidianTreeNode };

const EditorCanvas = () => {
  const tree = useApp((s) => s.tree);
  const selectedNodeId = useApp((s) => s.selectedNodeId);
  const select = useApp((s) => s.select);
  const applyDeleteMany = useApp((s) => s.applyDeleteMany);
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

  const onCanvasNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const removedIds = removableNodeIdsFromChanges(changes);
      if (removedIds.length > 0) applyDeleteMany(removedIds);

      const allowedChanges = nodeChangesWithoutBlockedDeletes(changes);
      if (allowedChanges.length > 0) onNodesChange(allowedChanges);
    },
    [applyDeleteMany, onNodesChange],
  );

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
      onNodesChange={onCanvasNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={editorNodeTypes}
      nodesConnectable
      edgesFocusable={false}
      onNodeClick={onNodeClick}
      onNodeDragStop={onNodeDragStop}
      onConnect={onConnect}
      defaultEdgeOptions={{ type: 'smoothstep', style: { stroke: '#52525b' } }}
      fitView
      fitViewOptions={{ padding: 0.22 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#27272a" gap={16} />
      <Controls className="!bg-zinc-900 !border-zinc-800" />
    </ReactFlow>
  );
};

const ObsidianTreeCanvas = () => {
  const tree = useApp((s) => s.tree);
  const selectedNodeId = useApp((s) => s.selectedNodeId);
  const select = useApp((s) => s.select);

  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);

  useEffect(() => {
    if (!tree) return;
    const laid = layoutObsidianTree(tree);
    setNodes(laid.nodes);
    setEdges(laid.edges);
  }, [tree, setNodes, setEdges]);

  const decoratedNodes = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedNodeId })),
    [nodes, selectedNodeId],
  );

  const onNodeClick: NodeMouseHandler = useCallback((_e, n) => select(n.id), [select]);

  return (
    <ReactFlow
      nodes={decoratedNodes}
      edges={edges}
      nodeTypes={obsidianNodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      edgesFocusable={false}
      onNodeClick={onNodeClick}
      defaultEdgeOptions={{ type: 'smoothstep', style: { stroke: '#3f3f46', strokeWidth: 1.6 } }}
      fitView
      fitViewOptions={{ padding: 0.28 }}
      minZoom={0.35}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#222225" gap={22} size={0.7} />
      <Controls className="!bg-zinc-900 !border-zinc-800" />
    </ReactFlow>
  );
};

export const TreeEditor = () => {
  const [mode, setMode] = useState<TreeViewMode>('editor');

  return (
    <div className="relative h-full">
      <div className="tree-view-switcher" role="group" aria-label="Tree view mode">
        <button
          type="button"
          className={mode === 'editor' ? 'active' : ''}
          onClick={() => setMode('editor')}
          aria-pressed={mode === 'editor'}
          title="Editable tree canvas"
        >
          <GitBranch size={13} /> Editor
        </button>
        <button
          type="button"
          className={mode === 'obsidian' ? 'active' : ''}
          onClick={() => setMode('obsidian')}
          aria-pressed={mode === 'obsidian'}
          title="Obsidian-style tree map"
        >
          <Network size={13} /> Tree
        </button>
      </div>
      <ReactFlowProvider key={mode}>{mode === 'editor' ? <EditorCanvas /> : <ObsidianTreeCanvas />}</ReactFlowProvider>
    </div>
  );
};

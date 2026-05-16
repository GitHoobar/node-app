import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, Code2, GitBranch, Network } from 'lucide-react';
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
import type { TreeNode } from '@shared/types';
import { useApp } from '../store';
import { layoutObsidianTree, layoutTree } from '../lib/layout';
import { nodeChangesWithoutBlockedDeletes, removableNodeIdsFromChanges } from '../lib/react-flow-node-changes';
import { formatTreeJson, parseTreeJson } from '../lib/tree-json';
import { ObsidianTreeNode } from './ObsidianTreeNode';
import { PageNode } from './PageNode';

type TreeViewMode = 'editor' | 'obsidian' | 'json';

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

const countTreeNodes = (tree: TreeNode): number =>
  1 + tree.children.reduce((count, child) => count + countTreeNodes(child), 0);

const JsonTreeEditor = () => {
  const tree = useApp((s) => s.tree);
  const replaceTree = useApp((s) => s.replaceTree);
  const [draft, setDraft] = useState(() => (tree ? formatTreeJson(tree) : ''));
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!tree) {
      draftRef.current = '';
      setDraft('');
      setError(null);
      return;
    }

    const parsed = parseTreeJson(draftRef.current);
    if (parsed.ok && formatTreeJson(parsed.tree) === formatTreeJson(tree)) return;

    const nextDraft = formatTreeJson(tree);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setError(null);
  }, [tree]);

  const onChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const nextDraft = event.target.value;
      draftRef.current = nextDraft;
      setDraft(nextDraft);

      const parsed = parseTreeJson(nextDraft);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }

      setError(null);
      if (!tree || formatTreeJson(parsed.tree) !== formatTreeJson(tree)) {
        replaceTree(parsed.tree);
      }
    },
    [replaceTree, tree],
  );

  const nodeCount = useMemo(() => (tree ? countTreeNodes(tree) : 0), [tree]);

  return (
    <div className="flex h-full flex-col bg-zinc-950 px-4 pb-4 pt-16">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
          <Code2 size={14} className="text-emerald-300" />
          tree.json
        </div>
        <div className={error ? 'text-xs font-medium text-red-300' : 'text-xs text-zinc-500'}>
          {error ? 'invalid' : `${nodeCount} nodes`}
        </div>
      </div>
      <textarea
        value={draft}
        onChange={onChange}
        spellCheck={false}
        aria-label="Tree JSON"
        className="min-h-0 flex-1 resize-none rounded-md border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-5 text-zinc-100 outline-none shadow-inner shadow-black/30 caret-emerald-300 selection:bg-emerald-400/20 focus:border-emerald-600"
      />
      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-red-900/70 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}
    </div>
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
        <button
          type="button"
          className={mode === 'json' ? 'active' : ''}
          onClick={() => setMode('json')}
          aria-pressed={mode === 'json'}
          title="JSON tree"
        >
          <Code2 size={13} /> JSON
        </button>
      </div>
      {mode === 'json' ? (
        <JsonTreeEditor />
      ) : (
        <ReactFlowProvider key={mode}>
          {mode === 'editor' ? <EditorCanvas /> : <ObsidianTreeCanvas />}
        </ReactFlowProvider>
      )}
    </div>
  );
};

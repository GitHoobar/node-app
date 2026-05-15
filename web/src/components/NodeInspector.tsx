import { Trash2 } from 'lucide-react';
import { useApp } from '../store';
import { ROOT_NODE_ID } from '@shared/types';
import { flattenWithParent } from '../lib/tree-ops';

export const NodeInspector = () => {
  const tree = useApp((s) => s.tree);
  const selectedId = useApp((s) => s.selectedNodeId);
  const update = useApp((s) => s.applyUpdate);
  const remove = useApp((s) => s.applyDelete);
  if (!tree) return null;

  const found = flattenWithParent(tree).find((f) => f.node.id === selectedId);
  if (!found) return null;
  const node = found.node;
  const isRoot = node.id === ROOT_NODE_ID;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Page</h2>
        {!isRoot && (
          <button
            onClick={() => remove(node.id)}
            className="rounded p-1 text-zinc-400 hover:bg-red-950 hover:text-red-300"
            title="Delete subtree"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Name {isRoot && <span className="text-amber-400">(home page)</span>}
        <input
          className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm"
          value={node.name}
          onChange={(e) => update(node.id, { name: e.target.value })}
          disabled={isRoot}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Prompt
        <textarea
          className="min-h-[200px] rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm leading-relaxed"
          value={node.prompt}
          onChange={(e) => update(node.id, { prompt: e.target.value })}
          placeholder="Describe how this page should look and what it should contain…"
        />
      </label>
    </div>
  );
};

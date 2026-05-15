import { Handle, Position, type NodeProps } from 'reactflow';
import { Plus } from 'lucide-react';
import clsx from 'clsx';
import type { TreeNode } from '@shared/types';
import { useApp } from '../store';

export const PageNode = ({ id, data, selected }: NodeProps<{ tree: TreeNode }>) => {
  const node = data.tree;
  const isRoot = id === 'root';
  const addChild = useApp((s) => s.applyAddChild);

  return (
    <div className={clsx('rf-page-node', selected && 'selected', isRoot && 'root')}>
      <Handle type="target" position={Position.Top} className="!bg-zinc-600" />
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium truncate">{node.name || 'Untitled'}</div>
        <button
          className="rounded bg-zinc-800 p-1 hover:bg-zinc-700"
          onClick={(e) => {
            e.stopPropagation();
            addChild(id);
          }}
          title="Add child page"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="mt-1 text-[10px] text-zinc-400 line-clamp-2">
        {node.prompt || <span className="italic">no prompt yet</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-600" />
    </div>
  );
};

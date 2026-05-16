import { Handle, Position, type NodeProps } from 'reactflow';
import clsx from 'clsx';
import { ROOT_NODE_ID } from '@shared/types';
import type { ObsidianTreeNodeData } from '../lib/layout';

export const ObsidianTreeNode = ({ id, data, selected }: NodeProps<ObsidianTreeNodeData>) => {
  const node = data.tree;
  const isRoot = id === ROOT_NODE_ID;
  const childLabel = data.childCount === 1 ? '1 child' : `${data.childCount} children`;

  return (
    <div
      className={clsx('obsidian-tree-node', selected && 'selected', isRoot && 'root')}
      title={`${node.name || 'Untitled'}${data.childCount > 0 ? `, ${childLabel}` : ''}`}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="obsidian-tree-handle" />
      <div className="obsidian-tree-dot" aria-hidden="true" />
      <div className="obsidian-tree-label">
        <div className="obsidian-tree-title">{node.name || 'Untitled'}</div>
        {data.childCount > 0 && <div className="obsidian-tree-count">{childLabel}</div>}
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="obsidian-tree-handle" />
    </div>
  );
};

export type TreeNode = {
  id: string;
  name: string;
  prompt: string;
  children: TreeNode[];
};

export type Project = {
  id: string;
  name: string;
  sandboxId: string;
  codexThreadId: string | null;
  capabilityToken: string;
  tree: TreeNode;
  previewUrl: string | null;
  updatedAt: number;
};

export type CodexEvent =
  | { type: 'thread.started'; threadId: string }
  | { type: 'turn.started'; turnId: string }
  | { type: 'turn.completed'; turnId: string }
  | { type: 'turn.failed'; turnId: string; error?: string }
  | {
      type: 'item.started' | 'item.delta' | 'item.completed';
      itemId: string;
      kind: 'message' | 'reasoning' | 'file_change' | 'command' | 'tool_call';
      payload?: unknown;
    }
  | { type: 'approval.requested'; approvalId: string; summary: string }
  | { type: 'error'; message: string };

export type ServerSentEvent =
  | { kind: 'codex'; event: CodexEvent }
  | { kind: 'preview.reload' }
  | { kind: 'preview.url'; url: string }
  | { kind: 'log'; level: 'info' | 'warn' | 'error'; message: string };

export const ROOT_NODE_ID = 'root';

export const emptyTree = (): TreeNode => ({
  id: ROOT_NODE_ID,
  name: 'Home',
  prompt: '',
  children: [],
});

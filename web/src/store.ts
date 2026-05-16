import { create } from 'zustand';
import type { CodexEvent, Project, TreeNode } from '@shared/types';
import { ROOT_NODE_ID } from '@shared/types';
import { addChild, deleteNodes, reparent, updateNode } from './lib/tree-ops';

type EventLogItem = { id: number; ts: number; event: CodexEvent | { type: 'log'; level: string; message: string } };

type BootstrapPhase = 'unknown' | 'pending' | 'done' | 'failed';

type State = {
  project: Project | null;
  tree: TreeNode | null;
  selectedNodeId: string;
  previewUrl: string | null;
  previewKey: number;
  events: EventLogItem[];
  generating: boolean;
  codexConnected: boolean;
  loginModalOpen: boolean;
  bootstrap: BootstrapPhase;

  setProject: (p: Project) => void;
  updateProjectMetadata: (p: Project) => void;
  select: (id: string) => void;
  applyAddChild: (parentId: string) => void;
  applyUpdate: (id: string, patch: Partial<Pick<TreeNode, 'name' | 'prompt'>>) => void;
  applyDelete: (id: string) => void;
  applyDeleteMany: (ids: ReadonlyArray<string>) => void;
  applyReparent: (sourceId: string, targetId: string) => boolean;
  bumpPreview: () => void;
  setPreviewUrl: (url: string) => void;
  appendEvent: (e: EventLogItem['event']) => void;
  setGenerating: (g: boolean) => void;
  setCodexConnected: (c: boolean) => void;
  setLoginModalOpen: (o: boolean) => void;
  setBootstrap: (b: BootstrapPhase) => void;
};

let eid = 0;

export const useApp = create<State>((set, get) => ({
  project: null,
  tree: null,
  selectedNodeId: ROOT_NODE_ID,
  previewUrl: null,
  previewKey: 0,
  events: [],
  generating: false,
  codexConnected: false,
  loginModalOpen: false,
  bootstrap: 'unknown',

  setProject: (p) =>
    set({
      project: p,
      tree: p.tree,
      previewUrl: p.previewUrl,
      selectedNodeId: ROOT_NODE_ID,
      events: [],
      generating: false,
      codexConnected: false,
      loginModalOpen: false,
      bootstrap: 'unknown',
    }),
  updateProjectMetadata: (p) =>
    set((s) => {
      if (s.project?.id !== p.id) return {};
      return {
        project: {
          ...s.project,
          name: p.name,
          sandboxId: p.sandboxId,
          codexThreadId: p.codexThreadId,
          capabilityToken: p.capabilityToken,
          previewUrl: p.previewUrl,
          updatedAt: p.updatedAt,
        },
        previewUrl: p.previewUrl,
      };
    }),
  select: (id) => set({ selectedNodeId: id }),
  applyAddChild: (parentId) => {
    const tree = get().tree;
    if (!tree) return;
    set({ tree: addChild(tree, parentId) });
  },
  applyUpdate: (id, patch) => {
    const tree = get().tree;
    if (!tree) return;
    set({ tree: updateNode(tree, id, patch) });
  },
  applyDelete: (id) => {
    get().applyDeleteMany([id]);
  },
  applyDeleteMany: (ids) => {
    const tree = get().tree;
    if (!tree) return;
    if (ids.length === 0) return;
    set({ tree: deleteNodes(tree, ids), selectedNodeId: ROOT_NODE_ID });
  },
  applyReparent: (sourceId, targetId) => {
    const tree = get().tree;
    if (!tree) return false;
    const next = reparent(tree, sourceId, targetId);
    if (!next) return false;
    set({ tree: next });
    return true;
  },
  bumpPreview: () => set((s) => ({ previewKey: s.previewKey + 1 })),
  setPreviewUrl: (url) => set((s) => ({ previewUrl: url, project: s.project ? { ...s.project, previewUrl: url } : s.project })),
  appendEvent: (event) => set((s) => ({ events: [...s.events.slice(-300), { id: ++eid, ts: Date.now(), event }] })),
  setGenerating: (g) => set({ generating: g }),
  setCodexConnected: (c) => set({ codexConnected: c }),
  setLoginModalOpen: (o) => set({ loginModalOpen: o }),
  setBootstrap: (b) => set({ bootstrap: b }),
}));

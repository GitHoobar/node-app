import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderOpen, Loader2, Play, Plug, Save } from 'lucide-react';
import type { CodexEvent, Project } from '@shared/types';
import {
  createProject,
  generate,
  getLoginStatus,
  getPreviewReady,
  getProject,
  listProjects,
  openStream,
  patchTree,
  sendCodexInstruction,
} from './api';
import { useApp, type RunStatus } from './store';
import { TreeEditor } from './components/TreeEditor';
import { NodeInspector } from './components/NodeInspector';
import { Preview } from './components/Preview';
import { ConnectCodex } from './components/ConnectCodex';
import { ProjectsPage } from './components/ProjectsPage';
import { CodexChatComposer } from './components/CodexChatComposer';

const upsertProject = (items: Project[], project: Project): Project[] =>
  [project, ...items.filter((item) => item.id !== project.id)].sort((a, b) => b.updatedAt - a.updatedAt);

const codexEventRunStatus = (event: CodexEvent): RunStatus | null => {
  if (event.type === 'turn.started') return { phase: 'working', message: 'Codex is working on your app.' };
  if (event.type === 'turn.completed') return { phase: 'finishing', message: 'Codex finished. Refreshing preview.' };
  if (event.type === 'turn.failed') {
    return { phase: 'error', message: event.error ? `Codex failed: ${event.error}` : 'Codex failed.' };
  }
  if (event.type === 'error') return { phase: 'error', message: event.message };
  if (event.type !== 'item.started' && event.type !== 'item.delta') return null;

  if (event.kind === 'command') return { phase: 'working', message: 'Running commands in the sandbox.' };
  if (event.kind === 'file_change') return { phase: 'working', message: 'Applying file changes.' };
  if (event.kind === 'tool_call') return { phase: 'working', message: 'Using a tool.' };
  if (event.kind === 'reasoning') return { phase: 'working', message: 'Planning the changes.' };
  return { phase: 'working', message: 'Writing app updates.' };
};

const RUN_STATUS_CLASS: Record<RunStatus['phase'], string> = {
  idle: '',
  starting: 'border-sky-800 bg-sky-950/40 text-sky-200',
  working: 'border-emerald-800 bg-emerald-950/40 text-emerald-200',
  finishing: 'border-amber-800 bg-amber-950/40 text-amber-200',
  done: 'border-emerald-800 bg-emerald-950/30 text-emerald-300',
  error: 'border-red-800 bg-red-950/40 text-red-300',
};

const RunStatusBadge = ({ status }: { status: RunStatus }) => {
  if (status.phase === 'idle') return null;

  const isBusy = status.phase === 'starting' || status.phase === 'working' || status.phase === 'finishing';
  const Icon = status.phase === 'error' ? AlertTriangle : status.phase === 'done' ? CheckCircle2 : Loader2;

  return (
    <div
      aria-live="polite"
      title={status.message}
      className={`flex h-7 w-[260px] min-w-0 items-center gap-2 rounded border px-3 text-xs ${RUN_STATUS_CLASS[status.phase]}`}
    >
      <Icon size={13} className={isBusy ? 'shrink-0 animate-spin' : 'shrink-0'} />
      <span className="truncate">{status.message}</span>
    </div>
  );
};

type AppRoute = { page: 'projects' } | { page: 'editor'; projectId: string };

const parseRoute = (pathname: string): AppRoute => {
  const editorMatch = pathname.match(/^\/projects\/([^/]+)$/);
  if (editorMatch?.[1]) return { page: 'editor', projectId: decodeURIComponent(editorMatch[1]) };
  return { page: 'projects' };
};

const useRoute = (): [AppRoute, (path: string) => void] => {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((path: string) => {
    window.history.pushState(null, '', path);
    setRoute(parseRoute(path));
  }, []);

  return [route, navigate];
};

export const App = () => {
  const [route, navigate] = useRoute();
  const project = useApp((s) => s.project);
  const projectId = route.page === 'editor' ? route.projectId : null;
  const projectSandboxId = project?.sandboxId ?? null;
  const tree = useApp((s) => s.tree);
  const setProject = useApp((s) => s.setProject);
  const clearProject = useApp((s) => s.clearProject);
  const updateProjectMetadata = useApp((s) => s.updateProjectMetadata);
  const setPreviewUrl = useApp((s) => s.setPreviewUrl);
  const bumpPreview = useApp((s) => s.bumpPreview);
  const appendEvent = useApp((s) => s.appendEvent);
  const setGenerating = useApp((s) => s.setGenerating);
  const generating = useApp((s) => s.generating);
  const runStatus = useApp((s) => s.runStatus);
  const setRunStatus = useApp((s) => s.setRunStatus);
  const codexConnected = useApp((s) => s.codexConnected);
  const setCodexConnected = useApp((s) => s.setCodexConnected);
  const loginModalOpen = useApp((s) => s.loginModalOpen);
  const setLoginModalOpen = useApp((s) => s.setLoginModalOpen);
  const bootstrap = useApp((s) => s.bootstrap);
  const setBootstrap = useApp((s) => s.setBootstrap);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const savedTreeJson = useRef<string | null>(null);
  const latestTreeJson = useRef<string | null>(null);
  const ensuredSandboxKey = useRef<string | null>(null);

  const refreshProjectMetadata = useCallback(
    async (projectId: string): Promise<Project | null> => {
      try {
        const updated = await getProject(projectId);
        updateProjectMetadata(updated);
        setProjects((current) => upsertProject(current, updated));
        return updated;
      } catch {
        return null;
      }
    },
    [updateProjectMetadata],
  );

  useEffect(() => {
    let cancelled = false;
    setProjectsLoading(true);
    listProjects()
      .then((list) => {
        if (cancelled) return;
        setProjects(list);
        const currentProject = useApp.getState().project;
        if (currentProject) {
          const updated = list.find((item) => item.id === currentProject.id);
          if (updated) updateProjectMetadata(updated);
        }
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [updateProjectMetadata]);

  useEffect(() => {
    if (route.page === 'projects') {
      clearProject();
      return;
    }

    let cancelled = false;
    getProject(route.projectId)
      .then((selected) => {
        if (cancelled) return;
        setProjects((current) => upsertProject(current, selected));
        setProject(selected);
      })
      .catch(() => {
        if (!cancelled) navigate('/projects');
      });

    return () => {
      cancelled = true;
    };
  }, [route, clearProject, navigate, setProject]);

  useEffect(() => {
    if (!projectId) return;
    setCodexConnected(false);
    if (!projectSandboxId) {
      ensuredSandboxKey.current = null;
      setBootstrap('unknown');
      return;
    }
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      const r = await getPreviewReady(projectId);
      if (r.ready) {
        ensuredSandboxKey.current = null;
        setBootstrap('done');
        getLoginStatus(projectId)
          .then((s) => setCodexConnected(s.loggedIn))
          .catch(() => {});
        return;
      }
      setBootstrap('pending');
      const ensureKey = `${projectId}:${projectSandboxId}`;
      if (ensuredSandboxKey.current !== ensureKey) {
        ensuredSandboxKey.current = ensureKey;
        getLoginStatus(projectId)
          .then((s) => {
            if (stopped) return;
            setCodexConnected(s.loggedIn);
            void refreshProjectMetadata(projectId);
          })
          .catch(() => {
            if (ensuredSandboxKey.current === ensureKey) ensuredSandboxKey.current = null;
          });
      }
      setTimeout(poll, 3000);
    };
    poll();
    return () => {
      stopped = true;
    };
  }, [projectId, projectSandboxId, setCodexConnected, setBootstrap, refreshProjectMetadata]);

  useEffect(() => {
    if (!projectId) return;
    const es = openStream(projectId, (sse) => {
      if (sse.kind === 'preview.url') {
        setPreviewUrl(sse.url);
        void refreshProjectMetadata(projectId);
      } else if (sse.kind === 'preview.reload') {
        bumpPreview();
        setGenerating(false);
        setRunStatus({ phase: 'done', message: 'Finished. Preview refreshed.' });
        void refreshProjectMetadata(projectId);
      } else if (sse.kind === 'codex') {
        appendEvent(sse.event);
        const nextStatus = codexEventRunStatus(sse.event);
        if (nextStatus) setRunStatus(nextStatus);
        if (sse.event.type === 'turn.failed' || sse.event.type === 'error') setGenerating(false);
      } else if (sse.kind === 'log') {
        appendEvent({ type: 'log', level: sse.level, message: sse.message } as any);
        if (sse.level === 'info' && sse.message.includes('generating')) {
          setRunStatus({ phase: 'working', message: 'Starting Codex generation.' });
        }
        if (sse.level === 'error') {
          setGenerating(false);
          setRunStatus({ phase: 'error', message: sse.message });
        }
        if (sse.message.includes('codex not connected')) {
          setCodexConnected(false);
          setLoginModalOpen(true);
        }
      } else if (sse.kind === 'bootstrap.started') {
        setBootstrap('pending');
      } else if (sse.kind === 'bootstrap.done') {
        setBootstrap('done');
        bumpPreview();
        void refreshProjectMetadata(projectId);
      } else if (sse.kind === 'bootstrap.failed') {
        setBootstrap('failed');
        setGenerating(false);
        setRunStatus({ phase: 'error', message: 'Sandbox setup failed.' });
        appendEvent({ type: 'error', message: `bootstrap failed: ${sse.message}` } as any);
      }
    });
    return () => es.close();
  }, [
    projectId,
    setPreviewUrl,
    bumpPreview,
    appendEvent,
    setGenerating,
    setRunStatus,
    setBootstrap,
    setCodexConnected,
    setLoginModalOpen,
    refreshProjectMetadata,
  ]);

  useEffect(() => {
    if (!project) {
      savedTreeJson.current = null;
      latestTreeJson.current = null;
      setSaveState('saved');
      return;
    }
    savedTreeJson.current = JSON.stringify(project.tree);
    latestTreeJson.current = JSON.stringify(project.tree);
    setSaveState('saved');
  }, [project?.id]);

  useEffect(() => {
    if (!tree) return;
    const serialized = JSON.stringify(tree);
    latestTreeJson.current = serialized;
    setSaveState((current) => {
      if (savedTreeJson.current === null || current === 'saving') return current;
      return serialized === savedTreeJson.current ? 'saved' : 'dirty';
    });
  }, [tree]);

  const onCreate = async () => {
    setCreating(true);
    try {
      const p = await createProject(`Project ${projects.length + 1}`);
      setProjects((current) => upsertProject(current, p));
      setProject(p);
      navigate(`/projects/${encodeURIComponent(p.id)}`);
    } finally {
      setCreating(false);
    }
  };

  const onSelectProject = async (projectId: string) => {
    const selected = await getProject(projectId);
    setProjects((current) => upsertProject(current, selected));
    setProject(selected);
    navigate(`/projects/${encodeURIComponent(projectId)}`);
  };

  const onConnectProject = async (projectId: string) => {
    await onSelectProject(projectId);
    setLoginModalOpen(true);
  };

  const onCodexConnected = useCallback(() => {
    setCodexConnected(true);
    if (projectId) {
      void refreshProjectMetadata(projectId);
    }
  }, [projectId, refreshProjectMetadata, setCodexConnected]);

  const saveCurrentTree = useCallback(async (): Promise<boolean> => {
    const currentProject = useApp.getState().project;
    const currentTree = useApp.getState().tree;
    if (!currentProject || !currentTree) return false;

    const serialized = JSON.stringify(currentTree);
    latestTreeJson.current = serialized;
    if (savedTreeJson.current === serialized) return true;

    setSaveState('saving');
    try {
      await patchTree(currentProject.id, currentTree);
      savedTreeJson.current = serialized;
      setSaveState(latestTreeJson.current === serialized ? 'saved' : 'dirty');
      appendEvent({ type: 'log', level: 'info', message: 'tree saved' } as any);
      return true;
    } catch {
      setSaveState('error');
      appendEvent({ type: 'error', message: 'failed to save tree' } as any);
      return false;
    }
  }, [appendEvent]);

  const onGenerate = async () => {
    if (!project) return;
    if (bootstrap !== 'done') return;
    if (!codexConnected) {
      setLoginModalOpen(true);
      return;
    }
    setGenerating(true);
    setRunStatus({ phase: 'starting', message: 'Saving tree before generation.' });
    try {
      const saved = await saveCurrentTree();
      if (!saved) {
        setGenerating(false);
        setRunStatus({ phase: 'error', message: 'Save failed. Generation did not start.' });
        return;
      }
      setRunStatus({ phase: 'starting', message: 'Starting Codex generation.' });
      const result = await generate(project.id);
      if (result.skipped) {
        setGenerating(false);
        setRunStatus({ phase: 'done', message: 'Finished. No tree changes to generate.' });
        void refreshProjectMetadata(project.id);
      }
    } catch {
      setGenerating(false);
      setRunStatus({ phase: 'error', message: 'Failed to start generation.' });
      appendEvent({ type: 'error', message: 'failed to start generation' } as any);
    }
  };

  const onSendCodexInstruction = async (message: string): Promise<boolean> => {
    if (!project) return false;
    if (!codexConnected) {
      setLoginModalOpen(true);
      return false;
    }
    if (bootstrap !== 'done') return false;
    setGenerating(true);
    setRunStatus({ phase: 'starting', message: 'Sending instruction to Codex.' });
    try {
      await sendCodexInstruction(project.id, message);
      setRunStatus({ phase: 'working', message: 'Codex is working on your instruction.' });
      return true;
    } catch {
      setGenerating(false);
      setRunStatus({ phase: 'error', message: 'Failed to send instruction.' });
      appendEvent({ type: 'error', message: 'failed to send instruction' } as any);
      return false;
    }
  };

  const onSaveTree = async () => {
    await saveCurrentTree();
  };

  const sandboxReady = bootstrap === 'done';
  const saveLabel = saveState === 'saving' ? 'saving...' : 'Save tree';
  const saveStatus =
    saveState === 'error' ? 'save failed' : saveState === 'dirty' ? 'unsaved changes' : saveState === 'saved' ? 'saved' : '';
  const saveClass =
    saveState === 'error'
      ? 'border-red-800 bg-red-950/40 text-red-300 hover:bg-red-950'
      : saveState === 'dirty'
        ? 'border-sky-700 bg-sky-950/40 text-sky-300 hover:bg-sky-950'
        : 'border-zinc-800 bg-zinc-900 text-zinc-500';

  if (route.page === 'projects') {
    return (
      <ProjectsPage
        projects={projects}
        creating={creating}
        loading={projectsLoading}
        onCreate={onCreate}
        onOpen={onSelectProject}
      />
    );
  }

  if (!project || project.id !== route.projectId) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-sm text-zinc-500">
        Loading project...
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[320px_1fr_380px] grid-rows-[44px_1fr_154px]">
      <header className="col-span-3 row-start-1 flex items-center justify-between border-b border-zinc-900 bg-zinc-950 px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/projects')}
            className="flex h-7 items-center gap-1 rounded border border-zinc-800 px-2 text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
          >
            <FolderOpen size={13} /> Projects
          </button>
          <div className="text-sm font-semibold">node-app</div>
          <div className="text-xs text-zinc-500">{project.name}</div>
        </div>
        <div className="flex items-center gap-2">
          {bootstrap === 'pending' && (
            <div className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
              setting up sandbox...
            </div>
          )}
          {bootstrap === 'failed' && (
            <div className="rounded border border-red-900 bg-red-950/40 px-3 py-1 text-xs text-red-300">
              sandbox setup failed
            </div>
          )}
          <button
            onClick={() => setLoginModalOpen(true)}
            className={
              'flex items-center gap-1 rounded border px-3 py-1 text-xs font-medium ' +
              (codexConnected
                ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                : 'border-amber-700 bg-amber-950/40 text-amber-300 hover:bg-amber-950')
            }
          >
            <Plug size={12} /> {codexConnected ? 'Codex connected' : 'Connect Codex'}
          </button>
          <button
            onClick={onSaveTree}
            disabled={saveState === 'saving'}
            className={`flex items-center gap-1 rounded border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60 ${saveClass}`}
            title={saveState === 'error' ? 'Save failed. Click to retry.' : 'Save tree'}
          >
            <Save size={12} /> {saveLabel}
          </button>
          {saveStatus && <div className="w-24 text-xs text-zinc-500">{saveStatus}</div>}
          <RunStatusBadge status={runStatus} />
          <button
            onClick={onGenerate}
            disabled={generating || !sandboxReady || !codexConnected}
            className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-medium hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play size={12} /> {generating ? 'generating...' : 'Generate'}
          </button>
        </div>
      </header>

      <aside className="row-start-2 row-span-2 border-r border-zinc-900 bg-zinc-950 overflow-y-auto">
        <NodeInspector />
      </aside>

      <main className="row-start-2 bg-zinc-950">
        <TreeEditor />
      </main>

      <section className="row-start-2 border-l border-zinc-900 bg-zinc-950">
        <div className="h-full">
          <Preview />
        </div>
      </section>

      <section className="col-start-2 col-span-2 row-start-3 border-t border-zinc-900 bg-zinc-950">
        <CodexChatComposer
          busy={generating}
          sandboxReady={sandboxReady}
          codexConnected={codexConnected}
          onSubmit={onSendCodexInstruction}
        />
      </section>

      {loginModalOpen && (
        <ConnectCodex
          projectId={project.id}
          onConnected={onCodexConnected}
          onClose={() => setLoginModalOpen(false)}
        />
      )}
    </div>
  );
};

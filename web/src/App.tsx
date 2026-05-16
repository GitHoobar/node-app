import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Plug, Save } from 'lucide-react';
import type { Project } from '@shared/types';
import { createProject, generate, getLoginStatus, getPreviewReady, getProject, listProjects, openStream, patchTree } from './api';
import { useApp } from './store';
import { TreeEditor } from './components/TreeEditor';
import { NodeInspector } from './components/NodeInspector';
import { Preview } from './components/Preview';
import { EventLog } from './components/EventLog';
import { ConnectCodex } from './components/ConnectCodex';
import { ProjectsPanel } from './components/ProjectsPanel';

const upsertProject = (items: Project[], project: Project): Project[] =>
  [project, ...items.filter((item) => item.id !== project.id)].sort((a, b) => b.updatedAt - a.updatedAt);

export const App = () => {
  const project = useApp((s) => s.project);
  const projectId = project?.id ?? null;
  const projectSandboxId = project?.sandboxId ?? null;
  const tree = useApp((s) => s.tree);
  const setProject = useApp((s) => s.setProject);
  const updateProjectMetadata = useApp((s) => s.updateProjectMetadata);
  const setPreviewUrl = useApp((s) => s.setPreviewUrl);
  const bumpPreview = useApp((s) => s.bumpPreview);
  const appendEvent = useApp((s) => s.appendEvent);
  const setGenerating = useApp((s) => s.setGenerating);
  const generating = useApp((s) => s.generating);
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
          return;
        }
        const first = list[0];
        if (first) setProject(first);
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setProject, updateProjectMetadata]);

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
        void refreshProjectMetadata(projectId);
      } else if (sse.kind === 'codex') {
        appendEvent(sse.event);
        if (sse.event.type === 'turn.failed') setGenerating(false);
      } else if (sse.kind === 'log') {
        appendEvent({ type: 'log', level: sse.level, message: sse.message } as any);
        if (sse.level === 'error') {
          setGenerating(false);
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
      const p = await createProject(`Sandbox ${projects.length + 1}`);
      setProjects((current) => upsertProject(current, p));
      setProject(p);
      setLoginModalOpen(true);
    } finally {
      setCreating(false);
    }
  };

  const onSelectProject = async (projectId: string) => {
    const selected = await getProject(projectId);
    setProjects((current) => upsertProject(current, selected));
    setProject(selected);
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

  const onGenerate = async () => {
    if (!project) return;
    if (bootstrap !== 'done') return;
    if (!codexConnected) {
      setLoginModalOpen(true);
      return;
    }
    setGenerating(true);
    await generate(project.id);
  };

  const onSaveTree = async () => {
    const currentTree = useApp.getState().tree;
    if (!project || !currentTree) return;
    const serialized = JSON.stringify(currentTree);
    latestTreeJson.current = serialized;
    setSaveState('saving');
    try {
      await patchTree(project.id, currentTree);
      savedTreeJson.current = serialized;
      setSaveState(latestTreeJson.current === serialized ? 'saved' : 'dirty');
      appendEvent({ type: 'log', level: 'info', message: 'tree saved' } as any);
    } catch (error) {
      setSaveState('error');
      appendEvent({ type: 'error', message: 'failed to save tree' } as any);
    }
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

  return (
    <div className="grid h-full grid-cols-[320px_1fr_380px] grid-rows-[44px_1fr_180px]">
      <header className="col-span-3 row-start-1 flex items-center justify-between border-b border-zinc-900 bg-zinc-950 px-4">
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold">node-app</div>
          {project && <div className="text-xs text-zinc-500">{project.name}</div>}
        </div>
        <div className="flex items-center gap-2">
          {project && (
            <>
              {bootstrap === 'pending' && (
                <div className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
                  setting up sandbox…
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
              <button
                onClick={onGenerate}
                disabled={generating || !sandboxReady || !codexConnected}
                className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-medium hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play size={12} /> {generating ? 'generating…' : 'Generate'}
              </button>
            </>
          )}
        </div>
      </header>

      <aside className="row-start-2 row-span-2 border-r border-zinc-900 bg-zinc-950 overflow-y-auto">
        <ProjectsPanel
          projects={projects}
          activeProjectId={project?.id ?? null}
          creating={creating}
          loading={projectsLoading}
          onCreate={onCreate}
          onSelect={onSelectProject}
          onConnect={onConnectProject}
        />
        {project ? (
          <NodeInspector />
        ) : (
          <div className="p-4 text-sm text-zinc-500">Select a project sandbox to edit.</div>
        )}
      </aside>

      <main className="row-start-2 bg-zinc-950">
        {project ? <TreeEditor /> : <div className="flex h-full items-center justify-center text-sm text-zinc-500">Create or open a project sandbox.</div>}
      </main>

      <section className="row-start-2 row-span-2 border-l border-zinc-900 bg-zinc-950">
        <div className="h-full">
          <Preview />
        </div>
      </section>

      <section className="col-start-2 row-start-3 border-t border-zinc-900 bg-zinc-950">
        <EventLog />
      </section>

      {project && loginModalOpen && (
        <ConnectCodex
          projectId={project.id}
          onConnected={onCodexConnected}
          onClose={() => setLoginModalOpen(false)}
        />
      )}
    </div>
  );
};

import { useEffect, useRef, useState } from 'react';
import { Play, Plug } from 'lucide-react';
import { createProject, generate, getLoginStatus, getPreviewReady, listProjects, openStream, patchTree } from './api';
import { useApp } from './store';
import { TreeEditor } from './components/TreeEditor';
import { NodeInspector } from './components/NodeInspector';
import { Preview } from './components/Preview';
import { EventLog } from './components/EventLog';
import { ConnectCodex } from './components/ConnectCodex';

export const App = () => {
  const project = useApp((s) => s.project);
  const tree = useApp((s) => s.tree);
  const setProject = useApp((s) => s.setProject);
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
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listProjects().then((list) => {
      const first = list[0];
      if (first) setProject(first);
    });
  }, [setProject]);

  useEffect(() => {
    if (!project) return;
    setCodexConnected(false);
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      const r = await getPreviewReady(project.id);
      if (r.ready) {
        setBootstrap('done');
        getLoginStatus(project.id)
          .then((s) => setCodexConnected(s.loggedIn))
          .catch(() => {});
        return;
      }
      setTimeout(poll, 3000);
    };
    poll();
    return () => {
      stopped = true;
    };
  }, [project, setCodexConnected, setBootstrap]);

  useEffect(() => {
    if (!project) return;
    const es = openStream(project.id, (sse) => {
      if (sse.kind === 'preview.url') setPreviewUrl(sse.url);
      else if (sse.kind === 'preview.reload') {
        bumpPreview();
        setGenerating(false);
      } else if (sse.kind === 'codex') {
        appendEvent(sse.event);
        if (sse.event.type === 'turn.failed') setGenerating(false);
      } else if (sse.kind === 'log') {
        appendEvent({ type: 'log', level: sse.level, message: sse.message } as any);
      } else if (sse.kind === 'bootstrap.started') {
        setBootstrap('pending');
      } else if (sse.kind === 'bootstrap.done') {
        setBootstrap('done');
        bumpPreview();
      } else if (sse.kind === 'bootstrap.failed') {
        setBootstrap('failed');
        appendEvent({ type: 'error', message: `bootstrap failed: ${sse.message}` } as any);
      }
    });
    return () => es.close();
  }, [project, setPreviewUrl, bumpPreview, appendEvent, setGenerating]);

  const debouncer = useRef<number | null>(null);
  useEffect(() => {
    if (!project || !tree) return;
    if (debouncer.current) window.clearTimeout(debouncer.current);
    debouncer.current = window.setTimeout(() => {
      patchTree(project.id, tree).catch(() => {});
    }, 500);
  }, [tree, project]);

  const onCreate = async () => {
    setCreating(true);
    try {
      const p = await createProject('Untitled');
      setProject(p);
    } finally {
      setCreating(false);
    }
  };

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

  const sandboxReady = bootstrap === 'done';

  return (
    <div className="grid h-full grid-cols-[320px_1fr_380px] grid-rows-[44px_1fr_180px]">
      <header className="col-span-3 row-start-1 flex items-center justify-between border-b border-zinc-900 bg-zinc-950 px-4">
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold">node-app</div>
          {project && <div className="text-xs text-zinc-500">{project.name}</div>}
        </div>
        <div className="flex items-center gap-2">
          {!project && (
            <button
              onClick={onCreate}
              disabled={creating}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              {creating ? 'creating sandbox…' : 'New Project'}
            </button>
          )}
          {project && (
            <>
              {!sandboxReady && (
                <div className="rounded border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
                  {bootstrap === 'failed' ? 'sandbox setup failed' : 'setting up sandbox…'}
                </div>
              )}
              <button
                onClick={() => setLoginModalOpen(true)}
                disabled={!sandboxReady}
                className={
                  'flex items-center gap-1 rounded border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ' +
                  (codexConnected
                    ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                    : 'border-amber-700 bg-amber-950/40 text-amber-300 hover:bg-amber-950')
                }
              >
                <Plug size={12} /> {codexConnected ? 'Codex connected' : 'Connect Codex'}
              </button>
              <button
                onClick={onGenerate}
                disabled={generating || !sandboxReady}
                className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-medium hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play size={12} /> {generating ? 'generating…' : 'Generate'}
              </button>
            </>
          )}
        </div>
      </header>

      <aside className="row-start-2 row-span-2 border-r border-zinc-900 bg-zinc-950 overflow-y-auto">
        <NodeInspector />
      </aside>

      <main className="row-start-2 bg-zinc-950">
        {project ? <TreeEditor /> : <div className="flex h-full items-center justify-center text-sm text-zinc-500">Create a project to begin.</div>}
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
          onConnected={() => {
            setCodexConnected(true);
          }}
          onClose={() => setLoginModalOpen(false)}
        />
      )}
    </div>
  );
};

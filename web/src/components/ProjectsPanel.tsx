import { Box, FolderOpen, Plus, Plug } from 'lucide-react';
import clsx from 'clsx';
import type { Project } from '@shared/types';

type Props = {
  projects: Project[];
  activeProjectId: string | null;
  creating: boolean;
  loading: boolean;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onConnect: (id: string) => void;
};

const shortId = (id: string | null) => (id ? id.slice(0, 8) : 'not created');

export const ProjectsPanel = ({ projects, activeProjectId, creating, loading, onCreate, onSelect, onConnect }: Props) => {
  return (
    <section className="border-b border-zinc-900 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Box size={14} className="text-emerald-300" />
          Projects
        </div>
        <button
          onClick={onCreate}
          disabled={creating}
          className="flex h-7 items-center gap-1 rounded border border-emerald-800 bg-emerald-950/40 px-2 text-xs font-medium text-emerald-300 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
          title="New project sandbox"
        >
          <Plus size={13} /> {creating ? 'creating' : 'New'}
        </button>
      </div>

      <div className="flex max-h-[260px] flex-col gap-2 overflow-y-auto pr-1">
        {loading && <div className="rounded border border-zinc-900 bg-zinc-950 px-3 py-2 text-xs text-zinc-500">loading projects...</div>}
        {!loading && projects.length === 0 && (
          <div className="rounded border border-zinc-900 bg-zinc-950 px-3 py-3 text-xs text-zinc-500">No projects yet.</div>
        )}
        {projects.map((project) => {
          const active = project.id === activeProjectId;
          const hasSandbox = Boolean(project.sandboxId);
          return (
            <div
              key={project.id}
              className={clsx(
                'rounded-md border bg-zinc-950 p-2 transition-colors',
                active ? 'border-emerald-600/70 shadow-sm shadow-emerald-950/60' : 'border-zinc-800/70 hover:border-zinc-700',
              )}
            >
              <button onClick={() => onSelect(project.id)} className="block w-full text-left" title="Open project">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-100">{project.name}</div>
                    <div className="mt-1 font-mono text-[10px] text-zinc-500">{shortId(project.sandboxId)}</div>
                  </div>
                  <span
                    className={clsx(
                      'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium',
                      hasSandbox ? 'border-emerald-900 bg-emerald-950/40 text-emerald-300' : 'border-zinc-800 text-zinc-500',
                    )}
                  >
                    {hasSandbox ? 'sandbox' : 'draft'}
                  </span>
                </div>
              </button>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => onSelect(project.id)}
                  className={clsx(
                    'flex h-7 flex-1 items-center justify-center gap-1 rounded border px-2 text-xs font-medium',
                    active
                      ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                      : 'border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100',
                  )}
                >
                  <FolderOpen size={12} /> {active ? 'Active' : 'Open'}
                </button>
                <button
                  onClick={() => onConnect(project.id)}
                  className="flex h-7 flex-1 items-center justify-center gap-1 rounded border border-amber-800 bg-amber-950/30 px-2 text-xs font-medium text-amber-300 hover:bg-amber-950/60"
                >
                  <Plug size={12} /> Connect
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

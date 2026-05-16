import { Box, FolderOpen, Plus, Server } from 'lucide-react';
import type { Project } from '@shared/types';

type Props = {
  projects: Project[];
  creating: boolean;
  loading: boolean;
  onCreate: () => void;
  onOpen: (id: string) => void;
};

const shortId = (id: string | null) => (id ? id.slice(0, 8) : 'not started');

const updatedAt = (value: number) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

export const ProjectsPage = ({ projects, creating, loading, onCreate, onOpen }: Props) => {
  return (
    <div className="h-full overflow-y-auto bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-900 bg-zinc-950/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded border border-emerald-800 bg-emerald-950/40 text-emerald-300">
              <Box size={17} />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-normal">Projects</h1>
              <div className="text-xs text-zinc-500">{projects.length} total</div>
            </div>
          </div>
          <button
            onClick={onCreate}
            disabled={creating}
            className="flex h-9 items-center gap-2 rounded border border-emerald-800 bg-emerald-950/50 px-3 text-sm font-medium text-emerald-200 hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={15} />
            {creating ? 'Creating' : 'New project'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {loading && (
          <div className="rounded border border-zinc-900 bg-zinc-950 px-4 py-3 text-sm text-zinc-500">Loading projects...</div>
        )}

        {!loading && projects.length === 0 && (
          <div className="flex min-h-[320px] items-center justify-center rounded border border-zinc-900 bg-zinc-950">
            <div className="text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded border border-zinc-800 text-zinc-500">
                <FolderOpen size={18} />
              </div>
              <div className="mt-3 text-sm font-medium text-zinc-300">No projects yet</div>
            </div>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => onOpen(project.id)}
                className="group rounded-md border border-zinc-900 bg-zinc-950 p-4 text-left transition-colors hover:border-emerald-800 hover:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-100">{project.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">Updated {updatedAt(project.updatedAt)}</div>
                  </div>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-zinc-800 text-zinc-500 group-hover:border-emerald-800 group-hover:text-emerald-300">
                    <FolderOpen size={15} />
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-zinc-900 pt-3">
                  <div className="flex min-w-0 items-center gap-2 text-xs text-zinc-500">
                    <Server size={13} />
                    <span className="font-mono">{shortId(project.sandboxId)}</span>
                  </div>
                  <span className="rounded border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-500">
                    {project.previewUrl ? 'preview' : 'draft'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

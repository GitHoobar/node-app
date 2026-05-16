import { ExternalLink, Loader2, Plug } from 'lucide-react';
import { useApp } from '../store';
import { previewUrlForTree } from '../lib/preview-route';

export const Preview = () => {
  const url = useApp((s) => s.previewUrl);
  const key = useApp((s) => s.previewKey);
  const bootstrap = useApp((s) => s.bootstrap);
  const project = useApp((s) => s.project);
  const tree = useApp((s) => s.tree);

  if (!project?.sandboxId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-zinc-500">
        <Plug className="text-zinc-700" size={28} />
        <div className="font-medium text-zinc-400">No sandbox yet</div>
        <div className="px-6 text-xs text-zinc-500">
          Click <span className="text-amber-300">Connect Codex</span> to spin up your project's sandbox and authenticate.
        </div>
      </div>
    );
  }

  if (bootstrap !== 'done') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-zinc-500">
        <Loader2 className="animate-spin text-zinc-600" size={28} />
        <div>
          {bootstrap === 'failed' ? (
            <span className="text-red-400">Bootstrap failed — see event log.</span>
          ) : (
            <>
              <div className="font-medium text-zinc-300">Setting up sandbox…</div>
              <div className="mt-1 text-xs text-zinc-500">First run installs bun + Next.js + Codex CLI. ~3–5 min.</div>
            </>
          )}
        </div>
      </div>
    );
  }
  if (!url) {
    return <div className="flex h-full items-center justify-center text-sm text-zinc-500">no preview URL</div>;
  }
  const previewUrl = project.codexThreadId ? previewUrlForTree(url, tree) : url;
  return (
    <div className="relative h-full w-full">
      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer"
        className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded border border-zinc-700 bg-zinc-950/90 px-2 py-1 text-xs font-medium text-zinc-200 shadow-sm hover:bg-zinc-900"
        title="Open full website"
      >
        <ExternalLink size={12} /> Open full view
      </a>
      <iframe key={key} src={previewUrl} className="h-full w-full border-0 bg-white" title="preview" />
    </div>
  );
};

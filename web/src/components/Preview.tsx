import { Loader2, Plug } from 'lucide-react';
import { useApp } from '../store';

export const Preview = () => {
  const url = useApp((s) => s.previewUrl);
  const key = useApp((s) => s.previewKey);
  const bootstrap = useApp((s) => s.bootstrap);
  const project = useApp((s) => s.project);

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
  return <iframe key={key} src={url} className="h-full w-full border-0 bg-white" title="preview" />;
};

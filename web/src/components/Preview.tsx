import { useApp } from '../store';

export const Preview = () => {
  const url = useApp((s) => s.previewUrl);
  const key = useApp((s) => s.previewKey);
  if (!url) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        sandbox spinning up…
      </div>
    );
  }
  return <iframe key={key} src={url} className="h-full w-full border-0 bg-white" title="preview" />;
};

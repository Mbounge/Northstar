import { RotateCcw } from 'lucide-react';

/** Every canvas preview gets the same identity and runtime reset affordance. */
export function PreviewChrome({ title, appName, onReset }: { title: string; appName?: string; onReset: () => void }) {
  return <div data-canvas-v2-preview-chrome className="absolute -top-14 left-0 z-20 w-full" style={{ color: 'var(--northstar-ink)' }}>
    <div title={title} className="cursor-grab truncate text-lg font-medium active:cursor-grabbing" style={{ lineHeight: '24px' }}>{title}</div>
    <div className="mt-1 flex items-center justify-between gap-2 text-xs" style={{ lineHeight: '18px' }}>
      <span className="truncate text-[10px] font-medium uppercase tracking-wider opacity-65">{appName ? 'Simulated app' : 'Preview'}</span>
      <button type="button" data-canvas-v2-screen-control aria-label={`Reset ${appName ?? title} ${appName ? 'simulated app' : 'preview'}`} title="Clear app state and return to its fresh start" className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-sm opacity-80 hover:bg-violet-400/10 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400" onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onReset(); }}>
        <RotateCcw size={14} aria-hidden="true" />Reset
      </button>
    </div>
  </div>;
}

import { getCurrentWindow } from '@tauri-apps/api/window';

export function TitleBar() {
  const window = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      className="bg-background/95 border-border/60 flex h-12 items-center justify-between border-b px-4"
    >
      <div className="no-drag flex items-center gap-2">
        <button
          type="button"
          className="titlebar-btn titlebar-btn-close"
          onClick={() => window.close()}
          aria-label="Close window"
        />
        <button
          type="button"
          className="titlebar-btn titlebar-btn-min"
          onClick={() => window.minimize()}
          aria-label="Minimize window"
        />
        <button
          type="button"
          className="titlebar-btn titlebar-btn-max"
          onClick={() => window.toggleMaximize()}
          aria-label="Maximize window"
        />
      </div>
      <div className="text-muted-foreground text-xs font-medium">FrameFast</div>
      <div className="w-12" />
    </div>
  );
}

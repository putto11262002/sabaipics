import * as React from 'react';
import { ColorPicker } from '@/components/color-picker';

export function TestPage() {
  const [color, setColor] = React.useState('#3b82f6');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-2xl space-y-8">
        <h1 className="text-3xl font-bold">Color Picker Demo</h1>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Selected Color</label>
            <div className="flex items-center gap-4">
              <ColorPicker value={color} onChange={setColor} />
              <div
                className="size-24 rounded-lg border-2 border-border"
                style={{ backgroundColor: color }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Color Value</label>
            <div className="rounded-md bg-muted p-4 font-mono text-sm">{color.toUpperCase()}</div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Dark Text Preview</label>
              <div
                className="rounded-lg border-2 border-border p-4"
                style={{ backgroundColor: color }}
              >
                <p className="text-foreground font-bold">Hello World!</p>
                <p className="text-foreground/80">This is a preview text.</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Light Text Preview</label>
              <div
                className="rounded-lg border-2 border-border p-4"
                style={{ backgroundColor: color }}
              >
                <p className="text-background font-bold">Hello World!</p>
                <p className="text-background/80">This is a preview text.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Button Preview</label>
            <div
              className="flex gap-2 rounded-lg border-2 border-border p-4"
              style={{ backgroundColor: color }}
            >
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

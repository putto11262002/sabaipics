import { Label } from '@/shared/components/ui/label';
import { ColorPicker } from '@/shared/components/ui/color-picker';
import type { SlideshowTheme } from '../types';

interface ThemeSettingsProps {
  theme: SlideshowTheme;
  onChange: (theme: SlideshowTheme) => void;
}

export function ThemeSettings({ theme, onChange }: ThemeSettingsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Label htmlFor="primary-color" className="w-20 text-xs">
          Primary
        </Label>
        <ColorPicker
          value={theme.primary}
          onChange={(color) => onChange({ ...theme, primary: color })}
          className="flex-1"
        />
      </div>
      <div className="flex items-center gap-3">
        <Label htmlFor="bg-color" className="w-20 text-xs">
          Background
        </Label>
        <ColorPicker
          value={theme.background}
          onChange={(color) => onChange({ ...theme, background: color })}
          className="flex-1"
        />
      </div>
    </div>
  );
}

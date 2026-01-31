import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@sabaipics/uiv3/components/sidebar';
import { ScrollArea } from '@sabaipics/uiv3/components/scroll-area';
import { Button } from '@sabaipics/uiv3/components/button';
import { Switch } from '@sabaipics/uiv3/components/switch';
import { Label } from '@sabaipics/uiv3/components/label';
import { Input } from '@sabaipics/uiv3/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sabaipics/uiv3/components/select';
import { Trash2, Eye, EyeOff } from 'lucide-react';
import type {
  SlideshowBlock,
  SlideshowTheme,
  BlockType,
  HeaderProps,
  GalleryProps,
  QrProps,
  StatsProps,
} from './types';

const BLOCK_LABELS: Record<BlockType, string> = {
  header: 'Header',
  gallery: 'Gallery',
  qr: 'QR Code',
  stats: 'Statistics',
  social: 'Social Links',
};

interface EditorSidebarProps {
  selectedBlock: SlideshowBlock | null;
  onUpdate: (props: SlideshowBlock['props']) => void;
  onToggle: () => void;
  onDelete: () => void;
  theme: SlideshowTheme;
  onThemeChange: (theme: SlideshowTheme) => void;
}

export function EditorSidebar({
  selectedBlock,
  onUpdate,
  onToggle,
  onDelete,
  theme,
  onThemeChange,
}: EditorSidebarProps) {
  return (
    <Sidebar side="right" collapsible="none" className="border-l">
      <SidebarHeader className="border-sidebar-border border-b px-4 py-3">
        <h3 className="text-sm font-semibold">
          {selectedBlock ? BLOCK_LABELS[selectedBlock.type] : 'Theme'}
        </h3>
      </SidebarHeader>

      <SidebarContent>
        <ScrollArea className="h-full">
          <div className="px-4 py-4">
            {selectedBlock ? (
              <BlockSettingsContent block={selectedBlock} onUpdate={onUpdate} onToggle={onToggle} />
            ) : (
              <ThemeSettings theme={theme} onChange={onThemeChange} />
            )}
          </div>
        </ScrollArea>
      </SidebarContent>

      {selectedBlock && (
        <SidebarFooter className="p-4">
          <Button variant="destructive" size="sm" onClick={onDelete} className="w-full gap-2">
            <Trash2 className="size-4" />
            Remove Block
          </Button>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

function BlockSettingsContent({
  block,
  onUpdate,
  onToggle,
}: {
  block: SlideshowBlock;
  onUpdate: (props: SlideshowBlock['props']) => void;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Enable/Disable toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-sm">Enabled</Label>
        <Button variant="ghost" size="sm" onClick={onToggle} className="gap-2">
          {block.enabled ? (
            <>
              <Eye className="size-4" /> On
            </>
          ) : (
            <>
              <EyeOff className="size-4" /> Off
            </>
          )}
        </Button>
      </div>

      {/* Block-specific settings */}
      <div className="space-y-3">
        <BlockSpecificSettings block={block} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

function BlockSpecificSettings({
  block,
  onUpdate,
}: {
  block: SlideshowBlock;
  onUpdate: (props: SlideshowBlock['props']) => void;
}) {
  switch (block.type) {
    case 'header':
      return <HeaderSettings props={block.props as HeaderProps} onUpdate={onUpdate} />;
    case 'gallery':
      return <GallerySettings props={block.props as GalleryProps} onUpdate={onUpdate} />;
    case 'qr':
      return <QrSettings props={block.props as QrProps} onUpdate={onUpdate} />;
    case 'stats':
      return <StatsSettings props={block.props as StatsProps} onUpdate={onUpdate} />;
    case 'social':
      return <p className="text-sm text-muted-foreground">Social link settings coming soon</p>;
  }
}

function HeaderSettings({
  props,
  onUpdate,
}: {
  props: HeaderProps;
  onUpdate: (p: HeaderProps) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Align</Label>
        <Select
          value={props.align}
          onValueChange={(v) => onUpdate({ ...props, align: v as 'left' | 'center' })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="center">Center</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Show Logo</Label>
        <Switch
          checked={props.showLogo}
          onCheckedChange={(v) => onUpdate({ ...props, showLogo: v })}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Show Name</Label>
        <Switch
          checked={props.showName}
          onCheckedChange={(v) => onUpdate({ ...props, showName: v })}
        />
      </div>
    </div>
  );
}

function GallerySettings({
  props,
  onUpdate,
}: {
  props: GalleryProps;
  onUpdate: (p: GalleryProps) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-20 text-xs">Density</Label>
      <Select
        value={props.density}
        onValueChange={(v) => onUpdate({ ...props, density: v as 's' | 'm' | 'l' })}
      >
        <SelectTrigger className="h-8 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="s">Small (12)</SelectItem>
          <SelectItem value="m">Medium (8)</SelectItem>
          <SelectItem value="l">Large (4)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function QrSettings({ props, onUpdate }: { props: QrProps; onUpdate: (p: QrProps) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Size</Label>
        <Select
          value={props.size}
          onValueChange={(v) => onUpdate({ ...props, size: v as 's' | 'm' | 'l' })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="s">Small</SelectItem>
            <SelectItem value="m">Medium</SelectItem>
            <SelectItem value="l">Large</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Label</Label>
        <Input
          value={props.label}
          onChange={(e) => onUpdate({ ...props, label: e.target.value })}
          className="h-8 flex-1 text-xs"
        />
      </div>
    </div>
  );
}

const STAT_OPTIONS = [
  { value: 'photos', label: 'Photos' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'searches', label: 'Searches' },
] as const;

function StatsSettings({
  props,
  onUpdate,
}: {
  props: StatsProps;
  onUpdate: (p: StatsProps) => void;
}) {
  const toggleStat = (stat: 'photos' | 'downloads' | 'searches') => {
    const show = props.show.includes(stat)
      ? props.show.filter((s) => s !== stat)
      : [...props.show, stat];
    onUpdate({ ...props, show });
  };

  return (
    <div className="space-y-2">
      {STAT_OPTIONS.map((opt) => (
        <div key={opt.value} className="flex items-center justify-between">
          <Label className="text-xs">{opt.label}</Label>
          <Switch
            checked={props.show.includes(opt.value)}
            onCheckedChange={() => toggleStat(opt.value)}
          />
        </div>
      ))}
    </div>
  );
}

function ThemeSettings({
  theme,
  onChange,
}: {
  theme: SlideshowTheme;
  onChange: (theme: SlideshowTheme) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Label htmlFor="primary-color" className="text-sm text-muted-foreground">
          Primary Color
        </Label>
        <div className="flex items-center gap-2">
          <input
            id="primary-color"
            type="color"
            value={theme.primary}
            onChange={(e) => onChange({ ...theme, primary: e.target.value })}
            className="h-8 w-8 cursor-pointer rounded border border-border"
          />
          <span className="font-mono text-xs text-muted-foreground">{theme.primary}</span>
        </div>
      </div>
    </div>
  );
}

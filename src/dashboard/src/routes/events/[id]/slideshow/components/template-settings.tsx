import { Label } from '@/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';
import type { TemplateId } from '../lib/templates';

interface TemplateSettingsProps {
  onApplyTemplate: (templateId: TemplateId) => void;
}

const TEMPLATE_INFO: Record<TemplateId, { name: string; description: string }> = {
  classic: {
    name: 'Classic',
    description: 'Traditional layout with subtitle',
  },
  'classic-portrait': {
    name: 'Classic Portrait',
    description: 'Classic layout for portrait screens',
  },
  minimal: {
    name: 'Minimal',
    description: 'Clean minimal layout',
  },
  'minimal-portrait': {
    name: 'Minimal Portrait',
    description: 'Minimal layout for portrait screens',
  },
};

export function TemplateSettings({ onApplyTemplate }: TemplateSettingsProps) {
  const handleChange = (templateId: string) => {
    onApplyTemplate(templateId as TemplateId);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Template</Label>
      <Select onValueChange={handleChange} defaultValue="classic">
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(TEMPLATE_INFO).map(([id, info]) => (
            <SelectItem key={id} value={id}>
              {info.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

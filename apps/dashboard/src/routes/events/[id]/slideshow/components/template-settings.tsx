import { Label } from '@sabaipics/uiv3/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sabaipics/uiv3/components/select';
import type { TemplateId } from '../lib/templates';

interface TemplateSettingsProps {
  onApplyTemplate: (templateId: TemplateId) => void;
}

const TEMPLATE_INFO: Record<TemplateId, { name: string; description: string }> = {
  classic: {
    name: 'Classic Centered',
    description: 'Traditional centered layout, professional',
  },
  modern: {
    name: 'Modern Horizontal',
    description: 'Clean horizontal header, spacious',
  },
  bold: {
    name: 'Bold Magazine',
    description: 'Dynamic with bold colors, eye-catching',
  },
  elegant: {
    name: 'Elegant Minimal',
    description: 'Sophisticated with refined spacing',
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

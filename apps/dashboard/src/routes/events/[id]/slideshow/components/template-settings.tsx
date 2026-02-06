import { Button } from '@sabaipics/uiv3/components/button';
import { Label } from '@sabaipics/uiv3/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sabaipics/uiv3/components/select';
import { Wand2 } from 'lucide-react';
import { useState } from 'react';
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
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('classic');

  const handleApply = () => {
    onApplyTemplate(selectedTemplate);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs">Template</Label>
        <Select value={selectedTemplate} onValueChange={(v) => setSelectedTemplate(v as TemplateId)}>
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

      <Button onClick={handleApply} size="sm" className="w-full gap-2">
        <Wand2 className="size-4" />
        Apply Template
      </Button>

      <p className="text-xs text-muted-foreground">
        This will replace your current layout with the selected template.
      </p>
    </div>
  );
}

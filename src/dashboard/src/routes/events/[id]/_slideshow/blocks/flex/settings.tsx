import { Label } from '@/shared/components/ui/label';
import { Switch } from '@/shared/components/ui/switch';
import { Button } from '@/shared/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Plus, GripVertical, X } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SlideshowBlock, FlexProps, SpacingSize } from '../../types';
import { getChildTypes, getBlockDef, createBlock, blockRegistry } from '../registry';

function SortableChild({
  child,
  onRemove,
  onSelect,
}: {
  child: SlideshowBlock;
  onRemove: (id: string) => void;
  onSelect?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: child.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const def = getBlockDef(child.type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded border bg-muted/50 px-2 py-1.5"
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <button
        type="button"
        className="flex-1 text-left text-xs hover:text-primary"
        onClick={() => onSelect?.(child.id)}
      >
        {def?.label ?? child.type}
      </button>
      <button
        type="button"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(child.id)}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function FlexSettings({
  block,
  onChange,
  onSelectBlock,
}: {
  block: SlideshowBlock;
  onChange: (updated: SlideshowBlock) => void;
  onSelectBlock?: (id: string) => void;
}) {
  const props = block.props as FlexProps;
  const children = block.children ?? [];

  const update = (patch: Partial<FlexProps>) => {
    onChange({ ...block, props: { ...props, ...patch } });
  };

  const handleAddChild = (type: string) => {
    const child = createBlock(type);
    onChange({
      ...block,
      children: [...children, child],
    });
  };

  const handleRemoveChild = (childId: string) => {
    onChange({
      ...block,
      children: children.filter((c) => c.id !== childId),
    });
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = children.findIndex((c) => c.id === active.id);
    const newIndex = children.findIndex((c) => c.id === over.id);
    onChange({
      ...block,
      children: arrayMove(children, oldIndex, newIndex),
    });
  };

  const childTypes = getChildTypes();

  return (
    <div className="space-y-4">
      {/* Direction */}
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Direction</Label>
        <Select
          value={props.direction}
          onValueChange={(v) => update({ direction: v as FlexProps['direction'] })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="row">Row</SelectItem>
            <SelectItem value="column">Column</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Align */}
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Align</Label>
        <Select
          value={props.align}
          onValueChange={(v) => update({ align: v as FlexProps['align'] })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="start">Start</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="end">End</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Justify */}
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Justify</Label>
        <Select
          value={props.justify}
          onValueChange={(v) => update({ justify: v as FlexProps['justify'] })}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="start">Start</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="end">End</SelectItem>
            <SelectItem value="between">Space Between</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Gap */}
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Gap</Label>
        <Select value={props.gap} onValueChange={(v) => update({ gap: v as SpacingSize })}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="xs">Extra Small</SelectItem>
            <SelectItem value="sm">Small</SelectItem>
            <SelectItem value="md">Medium</SelectItem>
            <SelectItem value="lg">Large</SelectItem>
            <SelectItem value="xl">Extra Large</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Padding */}
      <div className="flex items-center gap-2">
        <Label className="w-20 text-xs">Padding</Label>
        <Select value={props.padding} onValueChange={(v) => update({ padding: v as SpacingSize })}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="xs">Extra Small</SelectItem>
            <SelectItem value="sm">Small</SelectItem>
            <SelectItem value="md">Medium</SelectItem>
            <SelectItem value="lg">Large</SelectItem>
            <SelectItem value="xl">Extra Large</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Wrap */}
      <div className="flex items-center justify-between">
        <Label className="text-xs">Wrap</Label>
        <Switch checked={props.wrap} onCheckedChange={(v) => update({ wrap: v })} />
      </div>

      {/* Children */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Children</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                <Plus className="size-3" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {childTypes.map((type) => {
                const def = blockRegistry.get(type)!;
                const Icon = def.icon;
                return (
                  <DropdownMenuItem key={type} onClick={() => handleAddChild(type)}>
                    <Icon className="size-4" />
                    <span className="ml-2">{def.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {children.length === 0 ? (
          <p className="text-xs text-muted-foreground">No children yet</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={children.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {children.map((child) => (
                  <SortableChild
                    key={child.id}
                    child={child}
                    onRemove={handleRemoveChild}
                    onSelect={onSelectBlock}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

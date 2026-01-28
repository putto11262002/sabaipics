import { useId } from 'react';
import { useSortable } from '@dnd-kit/sortable';
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
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@sabaipics/uiv3/lib/utils';
import type { SlideshowBlock, SlideshowContext, FlexProps } from '../types';
import { getBlockDef } from '../blocks/registry';
import { gapClass, paddingClass } from '../lib/spacing';
import { ChildBlockWrapper } from './child-block-wrapper';

interface BlockWrapperProps {
  block: SlideshowBlock;
  isSelected: boolean;
  isChildSelected: boolean;
  selectedBlockId: string | null;
  onSelect: (id: string) => void;
  context: SlideshowContext;
  onReorderChildren?: (parentId: string, newChildren: SlideshowBlock[]) => void;
}

export function BlockWrapper({
  block,
  isSelected,
  isChildSelected,
  selectedBlockId,
  onSelect,
  context,
  onReorderChildren,
}: BlockWrapperProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const def = getBlockDef(block.type);
  if (!def) return null;

  const highlighted = isSelected || isChildSelected;
  const isLayout = def.acceptsChildren === true;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative cursor-grab active:cursor-grabbing',
        highlighted
          ? 'outline outline-2 outline-blue-500'
          : 'hover:outline hover:outline-1 hover:outline-blue-300',
        !block.enabled && 'opacity-40',
        isDragging && 'opacity-50',
      )}
      onClick={() => {
        onSelect(block.id);
      }}
      {...attributes}
      {...listeners}
    >
      {/* Block type label */}
      <div
        className={cn(
          'absolute -top-5 left-0 text-[10px] font-medium leading-none transition-opacity',
          highlighted
            ? 'text-blue-500 opacity-100'
            : 'text-muted-foreground opacity-0 group-hover:opacity-100',
        )}
      >
        {def.label}
      </div>

      {isLayout ? (
        <LayoutBlockContent
          block={block}
          selectedBlockId={selectedBlockId}
          onSelect={onSelect}
          context={context}
          onReorderChildren={onReorderChildren}
        />
      ) : (
        <def.Renderer block={block} context={context} />
      )}
    </div>
  );
}

function LayoutBlockContent({
  block,
  selectedBlockId,
  onSelect,
  context,
  onReorderChildren,
}: {
  block: SlideshowBlock;
  selectedBlockId: string | null;
  onSelect: (id: string) => void;
  context: SlideshowContext;
  onReorderChildren?: (parentId: string, newChildren: SlideshowBlock[]) => void;
}) {
  const dndId = useId();
  const props = block.props as FlexProps;
  const children = block.children ?? [];
  const enabledChildren = children.filter((c) => c.enabled);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = children.findIndex((c) => c.id === active.id);
    const newIndex = children.findIndex((c) => c.id === over.id);
    onReorderChildren?.(block.id, arrayMove(children, oldIndex, newIndex));
  };

  const strategy =
    props.direction === 'row' ? horizontalListSortingStrategy : verticalListSortingStrategy;

  return (
    <div
      className={cn(
        'flex',
        props.direction === 'column' ? 'flex-col' : 'flex-row',
        props.wrap && 'flex-wrap',
        props.align === 'center' && 'items-center',
        props.align === 'start' && 'items-start',
        props.align === 'end' && 'items-end',
        props.justify === 'center' && 'justify-center',
        props.justify === 'start' && 'justify-start',
        props.justify === 'end' && 'justify-end',
        props.justify === 'between' && 'justify-between',
        gapClass[props.gap],
        paddingClass[props.padding],
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
    >
      <DndContext
        id={`${dndId}-children-${block.id}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={enabledChildren.map((c) => c.id)} strategy={strategy}>
          {enabledChildren.map((child) => (
            <ChildBlockWrapper
              key={child.id}
              block={child}
              isSelected={selectedBlockId === child.id}
              onSelect={onSelect}
              context={context}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

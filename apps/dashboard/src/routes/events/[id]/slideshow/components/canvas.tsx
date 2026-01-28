import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import type { SlideshowBlock, SlideshowConfig, SlideshowContext } from '../types';
import { BlockWrapper } from './block-wrapper';

interface CanvasProps {
  config: SlideshowConfig;
  context: SlideshowContext;
  selectedBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onReorder: (blocks: SlideshowBlock[]) => void;
  onReorderChildren: (parentId: string, newChildren: SlideshowBlock[]) => void;
  onCanvasClick: (e: React.MouseEvent) => void;
}

export function Canvas({
  config,
  context,
  selectedBlockId,
  onSelectBlock,
  onReorder,
  onReorderChildren,
  onCanvasClick,
}: CanvasProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = config.blocks.findIndex((b) => b.id === active.id);
    const newIndex = config.blocks.findIndex((b) => b.id === over.id);
    onReorder(arrayMove(config.blocks, oldIndex, newIndex));
  };

  return (
    <div className="flex min-h-full justify-center bg-muted/50 p-8" onClick={onCanvasClick}>
      <div
        className="w-full max-w-3xl rounded-xl border bg-background p-6 shadow-sm"
        onClick={onCanvasClick}
      >
        {config.blocks.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No blocks yet. Use &quot;Add Block&quot; to get started.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={config.blocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {config.blocks.map((block) => (
                  <BlockWrapper
                    key={block.id}
                    block={block}
                    isSelected={selectedBlockId === block.id}
                    isChildSelected={block.children?.some((c) => c.id === selectedBlockId) ?? false}
                    selectedBlockId={selectedBlockId}
                    onSelect={onSelectBlock}
                    context={context}
                    onReorderChildren={onReorderChildren}
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

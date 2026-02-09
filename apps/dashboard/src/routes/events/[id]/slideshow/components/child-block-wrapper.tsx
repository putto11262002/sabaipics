import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@sabaipics/uiv3/lib/utils';
import type { SlideshowBlock, SlideshowContext } from '../types';
import { getBlockDef } from '../blocks/registry';

interface ChildBlockWrapperProps {
  block: SlideshowBlock;
  isSelected: boolean;
  onSelect: (id: string) => void;
  context: SlideshowContext;
}

export function ChildBlockWrapper({
  block,
  isSelected,
  onSelect,
  context,
}: ChildBlockWrapperProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const def = getBlockDef(block.type);
  if (!def) return null;

  const Renderer = def.Renderer;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative cursor-grab active:cursor-grabbing',
        isSelected
          ? 'outline outline-1 outline-blue-500'
          : 'hover:outline hover:outline-1 hover:outline-blue-300',
        !block.enabled && 'opacity-40',
        isDragging && 'opacity-50',
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
      {...attributes}
      {...listeners}
    >
      <Renderer block={block} context={context} />
    </div>
  );
}

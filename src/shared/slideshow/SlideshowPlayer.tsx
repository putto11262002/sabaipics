import type { SlideshowProps, SlideshowTemplateId } from './types';
import { CarouselTemplate, SpotlightTemplate } from './templates';

const templates: Record<SlideshowTemplateId, React.ComponentType<SlideshowProps>> = {
  carousel: CarouselTemplate,
  spotlight: SpotlightTemplate,
};

export const templateOptions: Array<{
  id: SlideshowTemplateId;
  name: string;
  description: string;
}> = [
  {
    id: 'carousel',
    name: 'Carousel',
    description: 'Photo carousel with 3 photos visible',
  },
  {
    id: 'spotlight',
    name: 'Spotlight',
    description: 'Single photo spotlight with footer bar',
  },
];

interface SlideshowPlayerProps extends SlideshowProps {
  templateId: SlideshowTemplateId;
}

export function SlideshowPlayer({ templateId, config, ...props }: SlideshowPlayerProps) {
  const Template = templates[templateId] ?? CarouselTemplate;

  // Scoped CSS variables - these override :root variables within this container only
  // This ensures the slideshow has its own theme without affecting the parent app
  const containerStyle = {
    '--primary': config.primaryColor,
    '--background': config.background,
  } as React.CSSProperties;

  // @container enables CSS container queries for responsive styles based on container width
  return (
    <div className="@container h-full w-full" style={containerStyle}>
      <Template config={config} {...props} />
    </div>
  );
}

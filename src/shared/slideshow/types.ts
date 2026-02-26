export interface SlideshowPhoto {
  id: string;
  r2Key: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface SlideshowEvent {
  id: string;
  name: string;
  subtitle?: string | null;
  logoUrl?: string | null;
}

export interface SlideshowStats {
  photoCount: number;
  searchCount: number;
  downloadCount: number;
}

export interface SlideshowConfig {
  primaryColor: string;
  background: string;
}

export interface SlideshowProps {
  event: SlideshowEvent;
  photos: SlideshowPhoto[];
  stats: SlideshowStats;
  config: SlideshowConfig;
  qrUrl: string;
  imageUrlBuilder: (r2Key: string, width: number) => string;
}

export type SlideshowTemplateId = 'carousel' | 'spotlight';

export interface SlideshowTemplate {
  id: SlideshowTemplateId;
  name: string;
  description: string;
  component: React.ComponentType<SlideshowProps>;
}

import type { SlideshowConfig } from './types';

export const DEFAULT_CONFIG: SlideshowConfig = {
  theme: { primary: '#6366f1', background: '#ffffff' },
  layout: [
    {
      id: 'header-1',
      type: 'header',
      enabled: true,
      props: { align: 'center' as const, showLogo: true, showName: true },
    },
    {
      id: 'gallery-1',
      type: 'gallery',
      enabled: true,
      props: { density: 'm' as const, autoplaySpeed: 0 },
    },
    {
      id: 'stats-1',
      type: 'stats',
      enabled: true,
      props: { show: ['photos', 'downloads'] as const },
    },
    {
      id: 'qr-1',
      type: 'qr',
      enabled: true,
      props: { size: 'm' as const, label: 'Scan to find your photos' },
    },
    {
      id: 'social-1',
      type: 'social',
      enabled: false,
      props: { links: [], showIcons: true },
    },
  ],
};

export const TEMPLATES: Record<string, SlideshowConfig> = {
  classic: {
    theme: { primary: '#6366f1', background: '#ffffff' },
    layout: [
      {
        id: 'header-1',
        type: 'header',
        enabled: true,
        props: { align: 'center' as const, showLogo: true, showName: true },
      },
      {
        id: 'gallery-1',
        type: 'gallery',
        enabled: true,
        props: { density: 'm' as const, autoplaySpeed: 0 },
      },
      {
        id: 'stats-1',
        type: 'stats',
        enabled: true,
        props: { show: ['photos', 'downloads'] as ('photos' | 'downloads' | 'searches')[] },
      },
      {
        id: 'qr-1',
        type: 'qr',
        enabled: true,
        props: { size: 'm' as const, label: 'Scan to find your photos' },
      },
      {
        id: 'social-1',
        type: 'social',
        enabled: false,
        props: { links: [], showIcons: true },
      },
    ],
  },
  gallery: {
    theme: { primary: '#10b981', background: '#0f172a' },
    layout: [
      {
        id: 'header-1',
        type: 'header',
        enabled: true,
        props: { align: 'left' as const, showLogo: false, showName: true },
      },
      {
        id: 'gallery-1',
        type: 'gallery',
        enabled: true,
        props: { density: 'l' as const, autoplaySpeed: 0 },
      },
      {
        id: 'qr-1',
        type: 'qr',
        enabled: true,
        props: { size: 's' as const, label: 'Find your photos' },
      },
      {
        id: 'stats-1',
        type: 'stats',
        enabled: false,
        props: { show: [] as ('photos' | 'downloads' | 'searches')[] },
      },
      {
        id: 'social-1',
        type: 'social',
        enabled: false,
        props: { links: [], showIcons: true },
      },
    ],
  },
  minimal: {
    theme: { primary: '#f59e0b', background: '#fafafa' },
    layout: [
      {
        id: 'header-1',
        type: 'header',
        enabled: true,
        props: { align: 'center' as const, showLogo: false, showName: true },
      },
      {
        id: 'gallery-1',
        type: 'gallery',
        enabled: true,
        props: { density: 'm' as const, autoplaySpeed: 0 },
      },
      {
        id: 'stats-1',
        type: 'stats',
        enabled: false,
        props: { show: [] as ('photos' | 'downloads' | 'searches')[] },
      },
      {
        id: 'qr-1',
        type: 'qr',
        enabled: false,
        props: { size: 'm' as const, label: 'Scan to find your photos' },
      },
      {
        id: 'social-1',
        type: 'social',
        enabled: false,
        props: { links: [], showIcons: true },
      },
    ],
  },
};

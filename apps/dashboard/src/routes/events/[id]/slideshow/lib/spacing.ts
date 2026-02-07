import type { SpacingSize, MaxWidthSize } from '../types';

export const gapClass: Record<SpacingSize, string> = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
};

export const paddingClass: Record<SpacingSize, string> = {
  none: 'p-0',
  xs: 'p-1',
  sm: 'p-2',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
};

export const maxWidthClass: Record<MaxWidthSize, string> = {
  none: '',
  sm: 'max-w-screen-sm',
  md: 'max-w-screen-md',
  lg: 'max-w-screen-lg',
  xl: 'max-w-screen-xl',
  '2xl': 'max-w-screen-2xl',
};

export const alignItemsClass: Record<'start' | 'center' | 'end', string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
};

import { cn } from '@/shared/utils/ui';

type Props = {
  children: React.ReactNode;
  className?: string;
};

export function SectionContainer({ children, className }: Props) {
  return (
    <div className={cn('mx-auto max-w-7xl px-4 md:px-6', className)}>
      {children}
    </div>
  );
}

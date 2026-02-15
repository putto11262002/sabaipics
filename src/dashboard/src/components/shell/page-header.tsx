import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';

import { cn } from '@/shared/utils/ui';
import { Button } from '@/shared/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';

interface BreadcrumbItemType {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  /** Breadcrumb navigation items */
  breadcrumbs?: BreadcrumbItemType[];
  /** If provided, shows a back button on the left */
  backHref?: string;
  /** Action buttons rendered on the right side */
  children?: ReactNode;
  /** Additional content to render on the left (after back button, before breadcrumbs) */
  leftContent?: ReactNode;
  /** Additional CSS classes for the header element */
  className?: string;
}

export function PageHeader({ breadcrumbs = [], backHref, children, leftContent, className }: PageHeaderProps) {
  return (
    <header className={cn("sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 bg-background px-4", className)}>
      {/* Left section */}
      <div className="flex items-center gap-2">
        {/* Back button */}
        {backHref && (
          <Button variant="ghost" size="icon" className="-ml-1" asChild>
            <Link to={backHref}>
              <ArrowLeft className="size-4" />
              <span className="sr-only">Go back</span>
            </Link>
          </Button>
        )}

        {/* Additional left content (e.g., SidebarTrigger + Separator) */}
        {leftContent}

        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((item, index) => (
                <Fragment key={item.label}>
                  {index > 0 && <BreadcrumbSeparator className="hidden md:block" />}
                  <BreadcrumbItem
                    className={index < breadcrumbs.length - 1 ? 'hidden md:block' : ''}
                  >
                    {item.href ? (
                      <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{item.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        )}
      </div>

      {/* Actions (right side) */}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </header>
  );
}

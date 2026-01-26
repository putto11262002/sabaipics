import type { ReactNode } from 'react';

import { Separator } from '@sabaipics/uiv2/components/separator';
import { SidebarTrigger } from '@sabaipics/uiv2/components/sidebar';
import { PageHeader } from './page-header';

interface BreadcrumbItemType {
  label: string;
  href?: string;
}

interface SidebarPageHeaderProps {
  /** Breadcrumb navigation items */
  breadcrumbs?: BreadcrumbItemType[];
  /** Action buttons rendered on the right side */
  children?: ReactNode;
}

export function SidebarPageHeader({ breadcrumbs = [], children }: SidebarPageHeaderProps) {
  return (
    <PageHeader
      breadcrumbs={breadcrumbs}
      leftContent={
        <>
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-2 h-4" />
        </>
      }
    >
      {children}
    </PageHeader>
  );
}

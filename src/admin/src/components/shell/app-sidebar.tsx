import * as React from 'react';
import { Gift, Users } from 'lucide-react';

import { LogoMark } from '@/shared/components/icons/logo-mark';
import { NavMain } from './nav-main';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/shared/components/ui/sidebar';

const data = {
  navMain: [
    {
      title: 'Users',
      url: '/users',
      icon: Users,
    },
    {
      title: 'Gift Codes',
      url: '/gift-codes',
      icon: Gift,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <a href="/" className="flex items-center gap-2 p-2">
          <LogoMark className="size-6" />
          <span className="font-medium">FrameFast Admin</span>
        </a>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <div className="p-2 text-xs text-muted-foreground">Admin</div>
      </SidebarFooter>
    </Sidebar>
  );
}

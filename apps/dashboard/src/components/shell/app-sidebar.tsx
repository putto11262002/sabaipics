import * as React from 'react';
import { LayoutDashboard, CalendarDays, Sparkles, Coins } from 'lucide-react';

import { LogoMark } from '../icons/logo-mark';
import { NavMain } from './nav-main';
import { NavSecondary } from './nav-secondary';
import { NavUser } from './nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@sabaipics/uiv3/components/sidebar';

const data = {
  navMain: [
    {
      title: 'Dashboard',
      url: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      title: 'Events',
      url: '/events',
      icon: CalendarDays,
    },
    {
      title: 'Studio',
      url: '/studio/luts',
      icon: Sparkles,
    },
    {
      title: 'Credits',
      url: '/credits',
      icon: Coins,
    },
    // {
    // 	title: "Galleries",
    // 	url: "/galleries",
    // 	icon: Images,
    // },
    // {
    // 	title: "Settings",
    // 	url: "/settings",
    // 	icon: Settings2,
    // 	items: [
    // 		{
    // 			title: "Profile",
    // 			url: "/settings/profile",
    // 		},
    // 		{
    // 			title: "Billing",
    // 			url: "/settings/billing",
    // 		},
    // 	],
    // },
  ],
  navSecondary: [
    // Hidden until implemented
    // {
    // 	title: "Support",
    // 	url: "/support",
    // 	icon: LifeBuoy,
    // },
    // {
    // 	title: "Feedback",
    // 	url: "/feedback",
    // 	icon: Send,
    // },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <a href="/dashboard" className="flex items-center gap-2 p-2">
          <LogoMark className="size-6" />
          <span className="font-medium">SabaiPics</span>
        </a>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

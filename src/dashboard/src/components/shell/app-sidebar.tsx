import * as React from 'react';
import { LayoutDashboard, CalendarDays, Sparkles, Wallet, MessageCircle } from 'lucide-react';

import { LogoMark } from '@/shared/components/icons/logo-mark';
import { NavMain } from './nav-main';
import { NavUser } from './nav-user';
import { FeedbackDialog } from './feedback-dialog';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/shared/components/ui/sidebar';

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
      icon: Wallet,
    },
    {
      title: 'LINE Delivery',
      url: '/line-delivery',
      icon: MessageCircle,
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
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <a href="/dashboard" className="flex items-center gap-2 p-2">
          <LogoMark className="size-6" />
          <span className="font-medium">FrameFast</span>
        </a>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <FeedbackDialog className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}

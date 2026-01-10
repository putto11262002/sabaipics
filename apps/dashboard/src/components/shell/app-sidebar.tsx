import * as React from "react";
import {
	Camera,
	CalendarDays,
	Images,
	LayoutDashboard,
	LifeBuoy,
	Send,
	Settings2,
} from "lucide-react";

import { NavMain } from "./nav-main";
import { NavSecondary } from "./nav-secondary";
import { NavUser } from "./nav-user";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@sabaipics/ui/components/sidebar";

const data = {
	navMain: [
		{
			title: "Dashboard",
			url: "/dashboard",
			icon: LayoutDashboard,
			isActive: true,
		},
		{
			title: "Events",
			url: "/events",
			icon: CalendarDays,
			items: [
				{
					title: "All Events",
					url: "/events",
				},
				{
					title: "Active",
					url: "/events?status=active",
				},
				{
					title: "Past",
					url: "/events?status=past",
				},
			],
		},
		{
			title: "Galleries",
			url: "/galleries",
			icon: Images,
		},
		{
			title: "Settings",
			url: "/settings",
			icon: Settings2,
			items: [
				{
					title: "Profile",
					url: "/settings/profile",
				},
				{
					title: "Billing",
					url: "/settings/billing",
				},
			],
		},
	],
	navSecondary: [
		{
			title: "Support",
			url: "/support",
			icon: LifeBuoy,
		},
		{
			title: "Feedback",
			url: "/feedback",
			icon: Send,
		},
	],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	return (
		<Sidebar {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<a href="/dashboard">
								<div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
									<Camera className="size-4" />
								</div>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">SabaiPics</span>
									<span className="truncate text-xs">Photographer</span>
								</div>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
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

import { Outlet } from "react-router";

import {
	SidebarInset,
	SidebarProvider,
} from "@sabaipics/ui/components/sidebar";
import { AppSidebar } from "./shell/app-sidebar";

export function Layout() {
	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<Outlet />
			</SidebarInset>
		</SidebarProvider>
	);
}

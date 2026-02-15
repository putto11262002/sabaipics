import { Outlet } from 'react-router';

import { SidebarInset, SidebarProvider } from '@/shared/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';

export function SidebarLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}

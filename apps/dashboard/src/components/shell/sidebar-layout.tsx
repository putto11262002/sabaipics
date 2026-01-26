import { Outlet } from 'react-router';

import { SidebarInset, SidebarProvider } from '@sabaipics/uiv3/components/sidebar';
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

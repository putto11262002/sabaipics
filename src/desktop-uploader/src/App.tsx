import React from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from '@/shared/components/ui/sidebar';
import { Button } from '@/shared/components/ui/button';
import { useAuth } from './auth/auth-context';
import { useEvents } from './hooks/use-events';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';

function AppShell() {
  const location = useLocation();
  const { status, startAuth, signOut } = useAuth();

  if (status !== 'signed_in') {
    return <SignedOutGuard />;
  }

  return (
    <div className="relative h-screen overflow-hidden bg-background">
      <div
        className="absolute z-20 top-0 h-8 w-full flex items-center justify-center"
        data-tauri-drag-region
      >
        <h1 className="text-primary text-xs font-semibold text-center">FrameFast</h1>
      </div>
      <div className="flex-1">
        <SidebarProvider>
          <Sidebar collapsible="icon" className="">
            <SidebarContent className="overflow-x-hidden grow h-full mt-4">
              <SidebarGroup>
                <SidebarGroupLabel>Overview</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={location.pathname === '/'}>
                        <Link to="/">Home</Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={location.pathname === '/syncs'}>
                        <Link to="/syncs">Syncs</Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={location.pathname === '/activity'}>
                        <Link to="/activity">Activity</Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              <SidebarSeparator />
            </SidebarContent>
            <SidebarFooter className="p-2">
              {status === 'signed_in' ? (
                <Button variant="secondary" size="sm" className="w-full" onClick={signOut}>
                  Sign out
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={startAuth}
                  disabled={status === 'signing_in'}
                >
                  {status === 'signing_in' ? 'Signing in...' : 'Sign in'}
                </Button>
              )}
            </SidebarFooter>
          </Sidebar>
          <SidebarInset className="min-h-svh">
            <div className="px-6 py-6 pt-8">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/syncs" element={<Syncs />} />
                <Route path="/activity" element={<Activity />} />
              </Routes>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </div>
  );
}

function SignedOutGuard() {
  const { status, error, startAuth } = useAuth();

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-6 py-8 text-center space-y-3">
        <h1 className="text-base font-semibold">FrameFast</h1>
        <p className="text-muted-foreground text-sm">Sign in to continue.</p>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
        <Button
          variant="secondary"
          size="sm"
          onClick={startAuth}
          disabled={status === 'signing_in'}
        >
          {status === 'signing_in' ? 'Signing in...' : 'Sign in'}
        </Button>
      </div>
    </div>
  );
}

function Home() {
  const { status, error } = useAuth();

  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">Home</h2>
      <p className="text-muted-foreground text-sm">
        Overview stats and recent activity will appear here.
      </p>
      <p className="text-muted-foreground text-xs">Auth status: {status}</p>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

function Syncs() {
  const { status } = useAuth();
  const eventsQuery = useEvents();
  const [mappings, setMappings] = React.useState<Mapping[]>([]);
  const [selectedEventId, setSelectedEventId] = React.useState<string>('');
  const [folderPath, setFolderPath] = React.useState<string>('');

  const events = eventsQuery.data?.data ?? [];

  const addMapping = () => {
    const event = events.find((e) => e.id === selectedEventId);
    if (!event || !folderPath.trim()) return;
    setMappings((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        eventId: event.id,
        eventName: event.name,
        folderPath: folderPath.trim(),
        status: 'idle',
      },
    ]);
    setSelectedEventId('');
    setFolderPath('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Syncs</h2>
          <p className="text-muted-foreground text-sm">Manage folder-to-event sync mappings.</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary" size="sm" disabled={status !== 'signed_in'}>
              Add mapping
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New sync mapping</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">Event</p>
                <Select
                  value={selectedEventId}
                  onValueChange={(value) => setSelectedEventId(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={eventsQuery.isLoading ? 'Loading...' : 'Select'} />
                  </SelectTrigger>
                  <SelectContent>
                    {events.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">Folder path</p>
                <Input
                  placeholder="Choose a folder path"
                  value={folderPath}
                  onChange={(event) => setFolderPath(event.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="secondary"
                size="sm"
                onClick={addMapping}
                disabled={!selectedEventId || !folderPath.trim()}
              >
                Save mapping
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {eventsQuery.isLoading ? (
          <p className="text-muted-foreground text-xs">Loading events...</p>
        ) : null}
        {eventsQuery.isError ? (
          <p className="text-destructive text-xs">{(eventsQuery.error as Error).message}</p>
        ) : null}
      </div>

      {mappings.length === 0 ? (
        <p className="text-muted-foreground text-sm">No mappings yet.</p>
      ) : (
        <div className="space-y-2">
          {mappings.map((mapping) => (
            <div
              key={mapping.id}
              className="border-border/60 bg-card flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{mapping.eventName}</p>
                <p className="text-muted-foreground text-xs">{mapping.folderPath}</p>
              </div>
              <span className="text-muted-foreground text-xs">{mapping.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Activity() {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">Activity</h2>
      <p className="text-muted-foreground text-sm">
        Upload history and retry controls will appear here.
      </p>
    </div>
  );
}

export default AppShell;

type Mapping = {
  id: string;
  eventId: string;
  eventName: string;
  folderPath: string;
  status: 'idle' | 'syncing' | 'paused' | 'error';
};

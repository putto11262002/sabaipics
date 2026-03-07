import React from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
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
import { Badge } from '@/shared/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { useEvents } from './hooks/use-events';
import { FolderIcon, ChevronRightIcon, PlusIcon, Trash2Icon, PlayIcon, SquareIcon, ArrowLeftIcon } from 'lucide-react';

type SyncStats = {
  pending: number;
  stabilizing: number;
  ready: number;
  uploading: number;
  done: number;
  failed: number;
};

type SyncInfo = {
  id: string;
  eventId: string;
  folderPath: string;
  running: boolean;
  paused: boolean;
  active: boolean;
  stats: SyncStats;
};

type StatsEvent = {
  syncId: string;
  stats: SyncStats;
};

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
                      <SidebarMenuButton asChild isActive={location.pathname.startsWith('/syncs')}>
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
                <Route path="/syncs/:eventId" element={<EventDetail />} />
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

// ── Helpers ───────────────────────────────────────────────────────────

const totalFiles = (s: SyncStats) =>
  s.pending + s.stabilizing + s.ready + s.uploading + s.done + s.failed;

const activeFiles = (s: SyncStats) =>
  s.pending + s.stabilizing + s.ready + s.uploading;

type EventStatus = 'idle' | 'syncing' | 'complete' | 'failed';

function getEventStatus(syncs: SyncInfo[]): EventStatus {
  if (syncs.length === 0) return 'idle';
  const agg = syncs.reduce(
    (acc, s) => ({
      total: acc.total + totalFiles(s.stats),
      active: acc.active + activeFiles(s.stats),
      failed: acc.failed + s.stats.failed,
      done: acc.done + s.stats.done,
      running: acc.running || s.running,
    }),
    { total: 0, active: 0, failed: 0, done: 0, running: false },
  );
  if (agg.failed > 0) return 'failed';
  if (agg.running || agg.active > 0) return 'syncing';
  if (agg.total > 0 && agg.active === 0) return 'complete';
  return 'idle';
}

const statusConfig: Record<EventStatus, { label: string; variant: 'secondary' | 'info' | 'success' | 'destructive' }> = {
  idle: { label: 'Idle', variant: 'secondary' },
  syncing: { label: 'Syncing', variant: 'info' },
  complete: { label: 'Complete', variant: 'success' },
  failed: { label: 'Has failures', variant: 'destructive' },
};

function folderName(path: string) {
  const parts = path.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || path;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

type FolderStatus = 'idle' | 'syncing' | 'complete' | 'failed';

function getFolderStatus(sync: SyncInfo): FolderStatus {
  const total = totalFiles(sync.stats);
  if (total === 0) return 'idle';
  if (sync.stats.failed > 0) return 'failed';
  if (sync.running || activeFiles(sync.stats) > 0) return 'syncing';
  if (activeFiles(sync.stats) === 0) return 'complete';
  return 'idle';
}

const folderStatusConfig: Record<FolderStatus, { label: string; variant: 'secondary' | 'info' | 'success' | 'destructive' }> = {
  idle: { label: 'Idle', variant: 'secondary' },
  syncing: { label: 'Syncing', variant: 'info' },
  complete: { label: 'Complete', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
};

// ── Syncs list page ───────────────────────────────────────────────────

function Syncs() {
  const [syncs, setSyncs] = React.useState<SyncInfo[]>([]);
  const eventsQuery = useEvents();
  const events = eventsQuery.data?.data ?? [];

  const refreshSyncs = React.useCallback(() => {
    invoke<SyncInfo[]>('list_syncs').then(setSyncs);
  }, []);

  React.useEffect(() => {
    refreshSyncs();
  }, [refreshSyncs]);

  React.useEffect(() => {
    const unlisten = listen<StatsEvent>('sync://stats', (event) => {
      const { syncId, stats } = event.payload;
      setSyncs((prev) =>
        prev.map((s) => (s.id === syncId ? { ...s, stats } : s)),
      );
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Group syncs by eventId
  const syncsByEvent = React.useMemo(() => {
    const map = new Map<string, SyncInfo[]>();
    for (const sync of syncs) {
      const list = map.get(sync.eventId) ?? [];
      list.push(sync);
      map.set(sync.eventId, list);
    }
    return map;
  }, [syncs]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Syncs</h2>
        <p className="text-muted-foreground text-sm">Select an event to manage folder syncs.</p>
      </div>

      {eventsQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading events...</p>
      ) : events.length === 0 ? (
        <p className="text-muted-foreground text-sm">No events found.</p>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const eventSyncs = syncsByEvent.get(event.id) ?? [];
            const hasSyncs = eventSyncs.length > 0;
            const status = hasSyncs ? getEventStatus(eventSyncs) : null;
            const cfg = status ? statusConfig[status] : null;
            const aggDone = eventSyncs.reduce((n, s) => n + s.stats.done, 0);
            const aggTotal = eventSyncs.reduce((n, s) => n + totalFiles(s.stats), 0);

            return (
              <Link
                key={event.id}
                to={`/syncs/${event.id}`}
                className="border-border/60 bg-card hover:bg-muted/50 flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors no-underline"
              >
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{event.name}</p>
                  {hasSyncs && (
                    <p className="text-muted-foreground text-xs shrink-0">
                      {eventSyncs.length} {eventSyncs.length === 1 ? 'folder' : 'folders'}
                      {aggTotal > 0 && ` · ${aggDone}/${aggTotal} files`}
                    </p>
                  )}
                </div>
                {cfg && <Badge variant={cfg.variant}>{cfg.label}</Badge>}
                <ChevronRightIcon className="size-4 text-muted-foreground shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Event detail page ─────────────────────────────────────────────────

function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [syncs, setSyncs] = React.useState<SyncInfo[]>([]);
  const [dirSizes, setDirSizes] = React.useState<Record<string, number>>({});
  const eventsQuery = useEvents();
  const events = eventsQuery.data?.data ?? [];
  const event = events.find((e) => e.id === eventId);

  const refreshSyncs = React.useCallback(() => {
    invoke<SyncInfo[]>('list_syncs').then((all) => {
      const filtered = all.filter((s) => s.eventId === eventId);
      setSyncs(filtered);
      // Fetch dir sizes for any new folders
      for (const sync of filtered) {
        invoke<number>('get_dir_size', { folderPath: sync.folderPath }).then((size) =>
          setDirSizes((prev) => ({ ...prev, [sync.id]: size })),
        );
      }
    });
  }, [eventId]);

  React.useEffect(() => {
    refreshSyncs();
  }, [refreshSyncs]);

  React.useEffect(() => {
    const unlisten = listen<StatsEvent>('sync://stats', (ev) => {
      const { syncId, stats } = ev.payload;
      setSyncs((prev) =>
        prev.map((s) => (s.id === syncId ? { ...s, stats } : s)),
      );
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleAddFolder = async () => {
    if (!eventId) return;
    const selected = await open({ directory: true, multiple: false, title: 'Select photo folder' });
    if (!selected) return;
    try {
      await invoke('add_sync', { eventId, folderPath: selected as string });
      refreshSyncs();
    } catch (err) {
      console.error('add_sync failed:', err);
    }
  };

  const handleStartSync = async (syncId: string) => {
    try {
      await invoke('start_sync', { syncId });
      setSyncs((prev) => prev.map((s) => (s.id === syncId ? { ...s, running: true, active: true } : s)));
    } catch (err) {
      console.error('start_sync failed:', err);
    }
  };

  const handleStopSync = async (syncId: string) => {
    try {
      await invoke('stop_sync', { syncId });
      setSyncs((prev) => prev.map((s) => (s.id === syncId ? { ...s, running: false, active: false } : s)));
    } catch (err) {
      console.error('stop_sync failed:', err);
    }
  };

  const handleRemoveSync = async (syncId: string) => {
    try {
      await invoke('remove_sync', { syncId });
      setSyncs((prev) => {
        const next = prev.filter((s) => s.id !== syncId);
        if (next.length === 0) navigate('/syncs');
        return next;
      });
    } catch (err) {
      console.error('remove_sync failed:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => navigate('/syncs')}>
          <ArrowLeftIcon className="size-3.5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold truncate">{event?.name ?? 'Event'}</h2>
          <p className="text-muted-foreground text-xs">
            {syncs.length} {syncs.length === 1 ? 'folder' : 'folders'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleAddFolder}>
          <PlusIcon className="mr-1 size-3.5" />
          Add folder
        </Button>
      </div>

      {syncs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No folders synced yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folder</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Files</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {syncs.map((sync) => {
              const total = totalFiles(sync.stats);
              const status = getFolderStatus(sync);
              const cfg = folderStatusConfig[status];
              const size = dirSizes[sync.id];

              return (
                <TableRow key={sync.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-0">
                      <FolderIcon className="size-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate max-w-[200px]" title={sync.folderPath}>
                          {folderName(sync.folderPath)}
                        </p>
                        <p className="text-muted-foreground text-xs truncate max-w-[200px]" title={sync.folderPath}>
                          {sync.folderPath}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {size !== undefined ? formatBytes(size) : '–'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {total > 0 ? (
                      <span>{sync.stats.done}/{total}</span>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!sync.running ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleStartSync(sync.id)}
                          title="Start sync"
                        >
                          <PlayIcon className="size-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleStopSync(sync.id)}
                          title="Stop sync"
                        >
                          <SquareIcon className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemoveSync(sync.id)}
                        disabled={sync.running}
                        title="Remove folder"
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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

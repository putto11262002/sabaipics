import { useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router';
import type { EventLayoutContext } from '../../components/EventLayout';
import { Camera, Trash2, Shield, FileText, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/shared/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog';
import { Spinner } from '@/shared/components/ui/spinner';
import { getSessionState, deleteSession, deleteSelfie } from '../../lib/api';
import { BottomNav } from '../../components/BottomNav';
import { th } from '../../lib/i18n';

export function SettingsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setHideBanner } = useOutletContext<EventLayoutContext>();

  useEffect(() => {
    setHideBanner(true);
    return () => setHideBanner(false);
  }, [setHideBanner]);

  const { data: session } = useQuery({
    queryKey: ['participant', 'session'],
    queryFn: getSessionState,
    staleTime: 60_000,
  });

  const selfies = session?.selfies ?? [];

  const deleteSelfMutation = useMutation({
    mutationFn: deleteSelfie,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant', 'session'] });
      toast.success(th.home.selfieDeleted);
    },
    onError: () => {
      toast.error(th.home.selfieDeleteError);
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: deleteSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant', 'session'] });
      toast.success(th.settings.requestDeleteSuccess);
      navigate(`/${eventId}/search`, { replace: true });
    },
    onError: () => {
      toast.error(th.settings.requestDeleteError);
    },
  });

  return (
    <div className="flex flex-1 min-h-0 flex-col pb-14">
      {/* Header */}
      <div className="px-4 py-4">
        <h1 className="text-lg font-semibold">{th.settings.title}</h1>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
        {/* Selfies Section */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium">{th.settings.selfies}</h2>
            <p className="text-xs text-muted-foreground">{th.settings.selfiesDescription}</p>
          </div>

          {selfies.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {selfies.map((s) => (
                <div key={s.id} className="relative">
                  <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
                    <img
                      src={s.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteSelfMutation.mutate(s.id)}
                    disabled={deleteSelfMutation.isPending}
                    className="absolute -right-1.5 -top-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-destructive/10 text-destructive backdrop-blur-md"
                  >
                    <X className="size-3" strokeWidth={3} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-6">
              <Camera className="size-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{th.settings.noSelfies}</span>
            </div>
          )}
        </section>

        {/* Data & Privacy Section */}
        <section className="space-y-1">
          <h2 className="mb-2 text-sm font-medium">{th.settings.dataPrivacy}</h2>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted"
              >
                <Trash2 className="size-5 text-destructive" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">{th.settings.requestDelete}</p>
                  <p className="text-xs text-muted-foreground">{th.settings.requestDeleteDescription}</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{th.settings.requestDeleteConfirm}</AlertDialogTitle>
                <AlertDialogDescription>{th.settings.requestDeleteWarning}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{th.common.cancel}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteSessionMutation.mutate()}
                  disabled={deleteSessionMutation.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteSessionMutation.isPending ? (
                    <Spinner className="mr-1 size-4" />
                  ) : null}
                  {th.common.confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>

        {/* About Section */}
        <section className="space-y-1">
          <h2 className="mb-2 text-sm font-medium">{th.settings.about}</h2>

          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted"
          >
            <Shield className="size-5 text-muted-foreground" />
            <span className="flex-1 text-sm">{th.settings.privacyPolicy}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </a>

          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted"
          >
            <FileText className="size-5 text-muted-foreground" />
            <span className="flex-1 text-sm">{th.settings.terms}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </a>
        </section>
      </div>

      <BottomNav eventId={eventId!} />
    </div>
  );
}

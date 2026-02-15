import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/components/ui/alert-dialog';
import { parseISO, differenceInDays } from 'date-fns';
import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { useParams } from 'react-router';
import { PhotoUploadZone } from './_components/PhotoUploadZone';
import { UploadQueueStatus } from './_components/UploadQueueStatus';
import { RecentUploadsTable } from './_components/RecentUploadsTable';
import { useUploadQueue } from './_components/useUploadQueue';
import { useEvent } from '../../../../hooks/events/useEvent';
import { Spinner } from '@/ui/components/ui/spinner';

export default function EventUploadTab() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useEvent(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (error || !data?.data) {
    return null;
  }

  return <EventUploadTabContent event={data.data} />;
}

function EventUploadTabContent({ event }: { event: { id: string; expiresAt: string } }) {
  const daysUntilExpiry = differenceInDays(parseISO(event.expiresAt), new Date());
  const isExpired = daysUntilExpiry <= 0;

  const { addFiles, uploadingItems, batchTotal } = useUploadQueue(event.id);

  // Block navigation if uploads are in progress
  const hasActiveUploads = uploadingItems.length > 0;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasActiveUploads && currentLocation.pathname !== nextLocation.pathname,
  );

  // Browser navigation guard (back button, close tab, refresh)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasActiveUploads) {
        e.preventDefault();
        e.returnValue = ''; // Chrome requires returnValue to be set
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasActiveUploads]);

  // Show confirmation dialog when navigation is blocked
  if (blocker.state === 'blocked') {
    return (
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upload in Progress</AlertDialogTitle>
            <AlertDialogDescription>
              You have {uploadingItems.length} photo(s) uploading. If you leave now, the uploads
              will be cancelled and you'll lose progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset()}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed()}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {/* Upload dropzone */}
      <PhotoUploadZone onFilesSelected={addFiles} disabled={isExpired} />

      {/* Progress bar for client-side upload queue */}
      <UploadQueueStatus items={uploadingItems} totalBatchSize={batchTotal} />

      {/* Paginated table of upload intents from DB */}
      <RecentUploadsTable eventId={event.id} />
    </div>
  );
}

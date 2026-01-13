import { Alert } from '@sabaipics/ui/components/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sabaipics/ui/components/alert-dialog';
import { parseISO, differenceInDays } from 'date-fns';
import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { PhotoUploadZone } from '../../../../components/photos/PhotoUploadZone';
import { UploadLog } from '../../../../components/photos/UploadLog';
import { useUploadQueue } from '../../../../hooks/photos/useUploadQueue';
import { usePhotos } from '../../../../hooks/photos/usePhotos';
import { useEventContext } from '../layout';

export default function EventUploadTab() {
  const { event } = useEventContext();

  const daysUntilExpiry = differenceInDays(parseISO(event.expiresAt), new Date());
  const isExpired = daysUntilExpiry <= 0;

  const {
    addFiles,
    setValidationErrors,
    validationErrors,
    uploadLog,
    uploadingItems,
  } = useUploadQueue(event.id);

  // Fetch photos that are NOT indexed (uploading, indexing, failed)
  const photosQuery = usePhotos({
    eventId: event.id,
    status: ['uploading', 'indexing', 'failed']
  });

  // Block navigation if uploads are in progress
  const hasActiveUploads = uploadingItems.length > 0;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasActiveUploads && currentLocation.pathname !== nextLocation.pathname
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
              You have {uploadingItems.length} photo(s) uploading. If you leave now, the uploads will be cancelled and you'll lose progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset()}>
              Stay
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed()}>
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Upload Photos</h3>

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <Alert variant="destructive" className="mb-4">
            <div>
              <p className="mb-2 font-medium">
                {validationErrors.length} {validationErrors.length === 1 ? 'file was' : 'files were'}{' '}
                rejected:
              </p>
              <div className="space-y-1 text-sm">
                {validationErrors.map((error, index) => (
                  <p key={index}>
                    <span className="font-medium">{error.file.name}:</span> {error.error}
                  </p>
                ))}
              </div>
            </div>
          </Alert>
        )}

        {/* Upload dropzone */}
        <PhotoUploadZone
          onFilesSelected={addFiles}
          onValidationErrors={setValidationErrors}
          disabled={isExpired}
        />
      </div>

      {/* Upload log - shows both local upload session and API photos */}
      <UploadLog
        entries={uploadLog}
        photosQuery={photosQuery}
        eventId={event.id}
      />
    </div>
  );
}

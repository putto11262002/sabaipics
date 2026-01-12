import { Alert } from '@sabaipics/ui/components/alert';
import { parseISO, differenceInDays } from 'date-fns';
import { PhotoUploadZone } from '../../../../components/photos/PhotoUploadZone';
import { UploadLog } from '../../../../components/photos/UploadLog';
import { useUploadQueue } from '../../../../hooks/photos/useUploadQueue';
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
  } = useUploadQueue(event.id);

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

      {/* Upload log - shows all uploads with their status */}
      <UploadLog entries={uploadLog} />
    </div>
  );
}

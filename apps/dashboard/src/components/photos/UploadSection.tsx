import { Alert } from '@sabaipics/ui/components/alert';
import { Badge } from '@sabaipics/ui/components/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sabaipics/ui/components/tabs';
import { PhotoUploadZone } from './PhotoUploadZone';
import { UploadingTable } from './UploadingTable';
import { FailedTable } from './FailedTable';
import { useUploadQueue } from '../../hooks/photos/useUploadQueue';

interface UploadSectionProps {
  eventId: string;
  isExpired: boolean;
}

export function UploadSection({ eventId, isExpired }: UploadSectionProps) {
  const {
    addFiles,
    retryUpload,
    removeFromQueue,
    setValidationErrors,
    uploadingItems,
    failedItems,
    uploadingCount,
    failedCount,
    validationErrors,
  } = useUploadQueue(eventId);

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

      {/* Upload status tabs - only show if there are items */}
      {(uploadingCount > 0 || failedCount > 0) && (
        <Tabs defaultValue={uploadingCount > 0 ? 'uploading' : 'failed'}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="uploading">
              Uploading
              {uploadingCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-2 h-5 min-w-5 rounded-full px-1 font-mono tabular-nums"
                >
                  {uploadingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="failed">
              Failed
              {failedCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-2 h-5 min-w-5 rounded-full px-1 font-mono tabular-nums"
                >
                  {failedCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="uploading">
            <UploadingTable items={uploadingItems} />
          </TabsContent>

          <TabsContent value="failed">
            <FailedTable items={failedItems} onRetry={retryUpload} onRemove={removeFromQueue} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

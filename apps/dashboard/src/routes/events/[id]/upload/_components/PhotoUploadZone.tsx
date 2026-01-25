import { useRef, useState } from "react";
import { Upload, XCircle } from "lucide-react";
import { Button } from "@sabaipics/uiv2/components/button";
import { Alert, AlertDescription } from "@sabaipics/uiv2/components/alert";
import { cn } from "@sabaipics/uiv2/lib/utils";

const ACCEPTED_FORMATS = ["image/jpeg", "image/png", "image/heic", "image/webp"];
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".heic", ".webp"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

interface ValidationError {
  file: File;
  error: string;
}

interface PhotoUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

function validateFile(file: File): string | null {
  // Check file type
  if (!ACCEPTED_FORMATS.includes(file.type.toLowerCase())) {
    return "Accepted formats: JPEG, PNG, HEIC, WebP";
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return "Maximum file size is 20MB";
  }

  return null;
}

export function PhotoUploadZone({
  onFilesSelected,
  disabled = false,
}: PhotoUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    const errors: ValidationError[] = [];

    fileArray.forEach((file) => {
      const error = validateFile(file);
      if (error) {
        errors.push({ file, error });
      } else {
        validFiles.push(file);
      }
    });

    // Set local validation errors
    if (errors.length > 0) {
      setValidationErrors(errors);
    }

    // Only pass valid files to parent
    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }
  };

  const clearErrors = () => {
    setValidationErrors([]);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    handleFiles(files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors",
          isDragging && !disabled
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <Upload className="mb-4 size-12 text-muted-foreground" />
        <div className="text-center">
          <p className="mb-2 text-lg font-medium">
            {isDragging ? "Drop photos here" : "Drag photos here or click to browse"}
          </p>
          <p className="text-sm text-muted-foreground">
            Accepted formats: JPEG, PNG, HEIC, WebP (max 20MB each)
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={handleFileInputChange}
          className="hidden"
        />
      </div>

      {/* Validation errors - shown below dropzone */}
      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
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
              <Button
                variant="ghost"
                size="sm"
                onClick={clearErrors}
                className="h-8 px-2 text-xs"
              >
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

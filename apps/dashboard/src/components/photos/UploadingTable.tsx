import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sabaipics/ui/components/table";
import { Badge } from "@sabaipics/ui/components/badge";
import { Progress } from "@sabaipics/ui/components/progress";
import { Spinner } from "@sabaipics/ui/components/spinner";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@sabaipics/ui/components/empty";
import { Image as ImageIcon, Upload as UploadIcon } from "lucide-react";
import type { UploadQueueItem } from "../../types/upload";

interface UploadingTableProps {
  items: UploadQueueItem[];
}

// Format file size utility
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function UploadingTable({ items }: UploadingTableProps) {
  // Filter only uploading and queued items
  const uploadingItems = items.filter(
    (item) => item.status === "queued" || item.status === "uploading"
  );

  // Empty state
  if (uploadingItems.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UploadIcon className="size-12" />
          </EmptyMedia>
          <EmptyTitle>No uploads in progress</EmptyTitle>
          <EmptyDescription>
            Select photos above to upload and they'll appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Table with uploading items
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          Uploading {uploadingItems.length} {uploadingItems.length === 1 ? "photo" : "photos"}
        </h3>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Preview</TableHead>
            <TableHead>Filename</TableHead>
            <TableHead className="w-24">Size</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead className="w-24">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {uploadingItems.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="size-12 rounded bg-muted flex items-center justify-center">
                  <ImageIcon className="size-6 text-muted-foreground" />
                </div>
              </TableCell>
              <TableCell className="font-medium">{item.file.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatFileSize(item.file.size)}
              </TableCell>
              <TableCell>
                {item.status === "uploading" ? (
                  <div className="flex items-center gap-2">
                    <Progress value={item.progress || 0} className="h-2 flex-1" />
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {item.progress || 0}%
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Queued</span>
                )}
              </TableCell>
              <TableCell>
                {item.status === "uploading" ? (
                  <Badge variant="secondary">
                    <Spinner className="size-3 mr-1" />
                    Uploading
                  </Badge>
                ) : (
                  <Badge variant="outline">Queued</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

import { Download } from 'lucide-react';

export function DownloadsTab() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Download className="size-8 text-muted-foreground" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">ยังไม่มีการดาวน์โหลด</p>
    </div>
  );
}

# T-19 Three-Tab UI Implementation Plan

Date: 2026-01-12
Root: BS_0001_S-1

## Overview

Refactor the T-19 photo upload UI into three separate tabs with improved UX:

1. **Photos** - Browse indexed photos (grid/list view)
2. **Uploading (X)** - Monitor active uploads (table view)
3. **Failed (X)** - Manage failed uploads (table with bulk actions)

## UX Requirements (from discussion)

### Tab Placement

- Upload dropzone is ABOVE the tabs (always visible)
- Three tabs below dropzone: Photos | Uploading (X) | Failed (X)

### View Modes

- **Photos tab:** Grid view (default) + List view toggle
- **Uploading tab:** Table view only
- **Failed tab:** Table view only with bulk actions

### Behaviors

- No auto-switch between tabs
- Badge counts on Uploading/Failed tabs (red/destructive for Failed)
- Empty sections are handled with Empty component

### List View Columns (Photos tab)

- Uploaded at
- File size
- Face count

## Architecture

### Component Structure

```
Event Detail Page
├── PhotoUploadZone (above tabs, always visible)
└── Tabs
    ├── Tab 1: Photos
    │   ├── View Toggle (Grid | List)
    │   ├── Grid View: Photo cards with AspectRatio
    │   └── List View: Table with columns
    ├── Tab 2: Uploading (badge count)
    │   └── Table with progress bars
    └── Tab 3: Failed (badge count, destructive)
        ├── Bulk Actions Bar (when items selected)
        └── Table with checkboxes + retry/remove actions
```

### State Management

```typescript
// In apps/dashboard/src/routes/events/[id]/index.tsx

const [activeTab, setActiveTab] = useState<'photos' | 'uploading' | 'failed'>('photos');
const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

// Derived state for badge counts
const uploadingCount = uploadQueue.filter(
  (i) => i.status === 'queued' || i.status === 'uploading',
).length;

const failedCount = uploadQueue.filter((i) => i.status === 'failed').length;
```

## Implementation Details

### 1. Photos Tab

#### Grid View (Default)

**Pattern:** Use Card + AspectRatio + Badge from shadcn exploration

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
  {photos.map((photo) => (
    <Card
      key={photo.id}
      className="overflow-hidden cursor-pointer"
      onClick={() => openLightbox(photo)}
    >
      <CardContent className="p-0 relative">
        <AspectRatio ratio={1}>
          <img
            src={photo.thumbnailUrl}
            alt={photo.id}
            className="object-cover w-full h-full"
            loading="lazy"
          />
        </AspectRatio>
        {/* Face count badge on hover */}
        <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-end justify-end p-2">
          {photo.faceCount !== null && (
            <Badge variant="secondary" className="opacity-0 hover:opacity-100 transition-opacity">
              {photo.faceCount} faces
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  ))}
</div>
```

**Empty State:**

```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon">
      <ImageIcon className="size-12" />
    </EmptyMedia>
    <EmptyTitle>No photos uploaded yet</EmptyTitle>
    <EmptyDescription>
      Upload photos above to get started. Photos will appear here once processed.
    </EmptyDescription>
  </EmptyHeader>
</Empty>
```

**Loading State:**

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
  {Array.from({ length: 8 }).map((_, i) => (
    <Card key={i}>
      <CardContent className="p-0">
        <Skeleton className="aspect-square w-full" />
      </CardContent>
    </Card>
  ))}
</div>
```

#### List View

**Pattern:** Use Table from shadcn exploration (data-table-demo.tsx)

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Preview</TableHead>
      <TableHead>Uploaded At</TableHead>
      <TableHead>File Size</TableHead>
      <TableHead>Face Count</TableHead>
      <TableHead>Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {photos.map((photo) => (
      <TableRow key={photo.id}>
        <TableCell>
          <img
            src={photo.thumbnailUrl}
            className="size-12 rounded object-cover cursor-pointer"
            onClick={() => openLightbox(photo)}
          />
        </TableCell>
        <TableCell>{formatDate(photo.uploadedAt)}</TableCell>
        <TableCell>{formatFileSize(photo.fileSize)}</TableCell>
        <TableCell>{photo.faceCount ?? '-'}</TableCell>
        <TableCell>
          <Button size="sm" variant="ghost" onClick={() => downloadPhoto(photo)}>
            <Download className="size-4" />
          </Button>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

**Empty State:** Same as grid view

**Loading State:**

```tsx
<Table>
  <TableHeader>...</TableHeader>
  <TableBody>
    {Array.from({ length: 5 }).map((_, i) => (
      <TableRow key={i}>
        <TableCell>
          <Skeleton className="size-12 rounded" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-32" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-20" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-16" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-8 w-8" />
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

#### View Toggle

**Pattern:** Use ToggleGroup from shadcn exploration

```tsx
<div className="flex justify-between items-center mb-4">
  <h3 className="text-lg font-semibold">
    {photos.length} {photos.length === 1 ? 'Photo' : 'Photos'}
  </h3>
  <ToggleGroup
    type="single"
    value={viewMode}
    onValueChange={(v) => v && setViewMode(v as 'grid' | 'list')}
  >
    <ToggleGroupItem value="grid" aria-label="Grid view">
      <LayoutGrid className="size-4" />
    </ToggleGroupItem>
    <ToggleGroupItem value="list" aria-label="List view">
      <List className="size-4" />
    </ToggleGroupItem>
  </ToggleGroup>
</div>
```

### 2. Uploading Tab

**Pattern:** Use Table with Progress bars from shadcn exploration

```tsx
<div className="space-y-4">
  {/* Header */}
  <div className="flex justify-between items-center">
    <h3 className="text-lg font-semibold">
      Uploading {uploadingItems.length} {uploadingItems.length === 1 ? 'photo' : 'photos'}
    </h3>
  </div>

  {/* Table */}
  {uploadingItems.length > 0 ? (
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
              {item.status === 'uploading' ? (
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
              {item.status === 'uploading' ? (
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
  ) : (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UploadIcon className="size-12" />
        </EmptyMedia>
        <EmptyTitle>No uploads in progress</EmptyTitle>
        <EmptyDescription>Select photos above to upload and they'll appear here.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )}
</div>
```

### 3. Failed Tab

**Pattern:** Use Table with Checkboxes + Bulk Actions from shadcn exploration (data-table-demo.tsx)

```tsx
// Use TanStack Table for row selection
import { useReactTable, getCoreRowModel, getFilteredRowModel } from '@tanstack/react-table';

const table = useReactTable({
  data: failedItems,
  columns: [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
    },
    // ... other columns
  ],
  getCoreRowModel: getCoreRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
});

return (
  <div className="space-y-4">
    {/* Bulk Actions Bar (sticky/fixed when items selected) */}
    {table.getFilteredSelectedRowModel().rows.length > 0 && (
      <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
        <span className="text-sm font-medium">
          {table.getFilteredSelectedRowModel().rows.length} selected
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRetrySelected(table.getFilteredSelectedRowModel().rows)}
          >
            <RotateCw className="size-4 mr-1" />
            Retry Selected
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleRemoveSelected(table.getFilteredSelectedRowModel().rows)}
          >
            <Trash className="size-4 mr-1" />
            Remove Selected
          </Button>
        </div>
      </div>
    )}

    {/* Table */}
    {failedItems.length > 0 ? (
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CheckCircle className="size-12" />
          </EmptyMedia>
          <EmptyTitle>No failed uploads</EmptyTitle>
          <EmptyDescription>All uploads completed successfully!</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )}
  </div>
);
```

**Column Definitions:**

```typescript
const columns: ColumnDef<UploadQueueItem>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "file",
    header: "Preview",
    cell: ({ row }) => (
      <div className="size-12 rounded bg-muted flex items-center justify-center">
        <ImageIcon className="size-6 text-muted-foreground" />
      </div>
    ),
  },
  {
    accessorKey: "file.name",
    header: "Filename",
    cell: ({ row }) => <span className="font-medium">{row.original.file.name}</span>,
  },
  {
    accessorKey: "file.size",
    header: "Size",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{formatFileSize(row.original.file.size)}</span>
    ),
  },
  {
    accessorKey: "error",
    header: "Error",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <AlertCircle className="size-4 text-destructive" />
        <span className="text-sm text-destructive">{row.original.error}</span>
      </div>
    ),
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const canRetry = !row.original.errorStatus ||
        (row.original.errorStatus !== 402 && row.original.errorStatus !== 403);

      return (
        <div className="flex gap-2">
          {canRetry && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRetry(row.original.id)}
            >
              <RotateCw className="size-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleRemove(row.original.id)}
          >
            <Trash className="size-4" />
          </Button>
        </div>
      );
    },
  },
];
```

### 4. Simplified Lightbox

**Pattern:** Use Dialog with minimal content from shadcn exploration

```tsx
<Dialog open={!!selectedPhoto} onOpenChange={(open) => !open && setSelectedPhoto(null)}>
  <DialogContent className="max-w-5xl w-full p-0 gap-0">
    {/* Image */}
    <div className="relative bg-black">
      <img
        src={selectedPhoto?.previewUrl}
        alt="Preview"
        className="w-full h-auto max-h-[80vh] object-contain"
      />
    </div>

    {/* Footer with download button only */}
    <div className="flex justify-between items-center p-4 border-t">
      <span className="text-sm text-muted-foreground">
        {selectedPhoto?.faceCount !== null && `${selectedPhoto.faceCount} faces detected`}
      </span>
      <Button variant="outline" size="sm" onClick={() => handleDownload(selectedPhoto)}>
        <Download className="size-4 mr-2" />
        Download
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

### 5. Tab Structure with Badges

**Pattern:** Use Tabs with Badge counts from dashboard-01/data-table.tsx

```tsx
<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
  <TabsList className="grid w-full grid-cols-3">
    <TabsTrigger value="photos">Photos</TabsTrigger>
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

  <TabsContent value="photos">{/* Photos tab content */}</TabsContent>

  <TabsContent value="uploading">{/* Uploading tab content */}</TabsContent>

  <TabsContent value="failed">{/* Failed tab content */}</TabsContent>
</Tabs>
```

## Files to Create/Modify

### New Components

1. `apps/dashboard/src/components/photos/PhotosGridView.tsx` - Grid view for photos tab
2. `apps/dashboard/src/components/photos/PhotosListView.tsx` - List view for photos tab
3. `apps/dashboard/src/components/photos/UploadingTable.tsx` - Uploading tab table
4. `apps/dashboard/src/components/photos/FailedTable.tsx` - Failed tab table with bulk actions
5. `apps/dashboard/src/components/photos/SimplePhotoLightbox.tsx` - Simplified lightbox

### Modified Components

1. `apps/dashboard/src/routes/events/[id]/index.tsx` - Refactor to 3-tab structure
2. `apps/dashboard/src/components/photos/PhotoUploadZone.tsx` - Keep as-is (above tabs)

### Delete (No Longer Needed)

1. `apps/dashboard/src/components/photos/PhotoGalleryGrid.tsx` - Replaced by PhotosGridView + PhotosListView
2. `apps/dashboard/src/components/photos/PhotoLightbox.tsx` - Replaced by SimplePhotoLightbox
3. `apps/dashboard/src/components/photos/UploadQueueSection.tsx` - Logic moved to tabs
4. `apps/dashboard/src/components/photos/PhotoStatusBadge.tsx` - No longer needed

## Utility Functions Needed

```typescript
// Format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Format date
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
```

## Dependencies to Install

```bash
# TanStack Table for Failed tab
pnpm --filter=@sabaipics/dashboard add @tanstack/react-table
```

## Testing Checklist

### Photos Tab

- [ ] Grid view displays photos correctly
- [ ] List view displays photos with metadata
- [ ] Toggle between grid/list works
- [ ] Empty state shows when no photos
- [ ] Loading skeletons show during fetch
- [ ] Clicking photo opens simplified lightbox
- [ ] Download button in lightbox works
- [ ] Pagination "Load More" works

### Uploading Tab

- [ ] Shows active uploads in table
- [ ] Progress bars update correctly
- [ ] File preview placeholders shown
- [ ] Empty state when no uploads
- [ ] Badge count updates in tab label

### Failed Tab

- [ ] Shows failed uploads in table
- [ ] Checkboxes work (select all, individual)
- [ ] Bulk action bar appears when items selected
- [ ] "Retry Selected" works for retryable errors
- [ ] "Remove Selected" works
- [ ] Individual retry/remove buttons work
- [ ] Non-retryable errors (402, 403) don't show retry
- [ ] Empty state when no failures
- [ ] Badge count (destructive variant) updates in tab label

### General

- [ ] Upload dropzone always visible above tabs
- [ ] No auto-switching between tabs
- [ ] Type check passes
- [ ] Build succeeds
- [ ] Mock data works correctly

## Implementation Notes

1. **Use TanStack Table** for Failed tab to get row selection for free
2. **Keep existing upload logic** from event detail page (queue management, concurrent limits)
3. **Reuse existing hooks** (usePhotos, useUploadPhoto) - no changes needed
4. **Follow shadcn patterns** exactly as documented in exploration report
5. **Progressive enhancement** - Each tab can be implemented and tested independently

## Success Criteria

- ✅ Three clear, separate tabs with proper information architecture
- ✅ Grid and list views for browsing photos
- ✅ Table views for managing uploads/failures
- ✅ Bulk operations for failed uploads
- ✅ Simplified lightbox with only image + download
- ✅ Upload dropzone always visible
- ✅ Badge counts on tabs
- ✅ Empty states for all scenarios
- ✅ Loading states for all scenarios
- ✅ Type-safe implementation
- ✅ Build passes

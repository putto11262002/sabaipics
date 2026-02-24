import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  type: 'soft' | 'hard';
  isLoading?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  type,
  isLoading = false,
}: DeleteConfirmDialogProps) {
  const isHardDelete = type === 'hard';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isHardDelete ? 'Permanently Delete Event' : 'Delete Event'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isHardDelete
              ? 'This will immediately and permanently delete the event, all photos, faces, searches, and files. This cannot be undone.'
              : `The event will be inaccessible immediately and permanently deleted after ${import.meta.env.DEV ? '30 days' : 'the retention period'}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? 'Deleting...' : isHardDelete ? 'Delete Permanently' : 'Delete Event'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

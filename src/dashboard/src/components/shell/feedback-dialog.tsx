import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/shared/components/ui/sidebar';
import { Textarea } from '@/shared/components/ui/textarea';
import { useSubmitFeedback } from '@/shared/hooks/rq/feedback/use-submit-feedback';

type Category = 'suggestion' | 'feature_request' | 'general';

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'feature_request', label: 'Feature Request' },
];

export function FeedbackDialog({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<Category>('general');
  const submitFeedback = useSubmitFeedback();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    submitFeedback.mutate(
      { content: content.trim(), category, source: 'dashboard' },
      {
        onSuccess: () => {
          toast.success('Thanks for your feedback!');
          setContent('');
          setCategory('general');
          setOpen(false);
        },
        onError: (error) => {
          toast.error('Failed to submit feedback', { description: error.message });
        },
      },
    );
  };

  return (
    <SidebarGroup className={className}>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <SidebarMenuButton className="bg-muted">
                  <Send />
                  <span>Feedback</span>
                </SidebarMenuButton>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Send Feedback</DialogTitle>
                  <DialogDescription>
                    Share your suggestions, feature requests, or general comments.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fb-category">Category</Label>
                    <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                      <SelectTrigger id="fb-category" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fb-content">Your feedback</Label>
                    <Textarea
                      id="fb-content"
                      placeholder="Tell us what's on your mind..."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      rows={5}
                      maxLength={5000}
                      required
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {content.length}/5000
                    </p>
                  </div>

                  <Button type="submit" className="w-full" disabled={submitFeedback.isPending || !content.trim()}>
                    {submitFeedback.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
                    Submit Feedback
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

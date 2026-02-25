import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Copy, Check, ExternalLink, Link } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/shared/components/ui/card';
import { Field, FieldGroup, FieldLabel, FieldContent, FieldDescription } from '@/shared/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Input } from '@/shared/components/ui/input';
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@/shared/components/ui/input-group';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { useCopyToClipboard } from '@/dashboard/src/hooks/use-copy-to-clipboard';

const DESTINATION_PAGES = [
  { value: '/sign-up', label: 'Sign up' },
  { value: '/sign-in', label: 'Sign in' },
  { value: '/', label: 'Home' },
] as const;

const SOURCE_PRESETS = [
  { value: 'facebook', label: 'Facebook', medium: 'social' },
  { value: 'line', label: 'LINE', medium: 'messaging' },
  { value: 'instagram', label: 'Instagram', medium: 'social' },
  { value: 'email', label: 'Email', medium: 'email' },
  { value: 'qr_code', label: 'QR Code', medium: 'qr' },
  { value: 'twitter', label: 'Twitter / X', medium: 'social' },
  { value: 'tiktok', label: 'TikTok', medium: 'social' },
  { value: 'custom', label: 'Custom', medium: '' },
] as const;

const schema = z.object({
  page: z.string().min(1),
  source: z.string().min(1),
  customSource: z.string().optional(),
  medium: z.string().optional(),
  campaign: z.string().optional(),
  content: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function buildUrl(values: FormValues): string | null {
  const { page, source, customSource, medium, campaign, content } = values;
  if (!page || !source) return null;

  const actualSource = source === 'custom' ? customSource?.trim() : source;
  if (!actualSource) return null;

  const base = import.meta.env.VITE_DASHBOARD_URL;
  const url = new URL(page, base);
  url.searchParams.set('utm_source', actualSource);
  if (medium?.trim()) url.searchParams.set('utm_medium', medium.trim());
  if (campaign?.trim()) url.searchParams.set('utm_campaign', campaign.trim());
  if (content?.trim()) url.searchParams.set('utm_content', content.trim());

  return url.toString();
}

function MarketingPage() {
  const { isCopied, copyToClipboard } = useCopyToClipboard();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      page: '/sign-up',
      source: '',
      customSource: '',
      medium: '',
      campaign: '',
      content: '',
    },
  });

  const watched = form.watch();
  const generatedUrl = buildUrl(watched);

  // Auto-fill medium when source changes
  const selectedSource = form.watch('source');
  useEffect(() => {
    if (selectedSource && selectedSource !== 'custom') {
      const preset = SOURCE_PRESETS.find((p) => p.value === selectedSource);
      if (preset) form.setValue('medium', preset.medium);
    }
  }, [selectedSource, form]);

  return (
    <>
      <SidebarPageHeader breadcrumbs={[{ label: 'Marketing' }]} />

      <div className="space-y-4 p-4">
        {/* UTM Link Builder */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">UTM Link Builder</CardTitle>
            <CardDescription>
              Generate trackable sign-up links for marketing channels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field orientation="responsive">
                <div>
                  <FieldLabel>Destination</FieldLabel>
                  <FieldDescription>Dashboard page to link to</FieldDescription>
                </div>
                <FieldContent>
                  <Select
                    value={watched.page}
                    onValueChange={(v) => form.setValue('page', v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DESTINATION_PAGES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>

              <Field orientation="responsive">
                <div>
                  <FieldLabel>Source</FieldLabel>
                  <FieldDescription>Where the traffic comes from</FieldDescription>
                </div>
                <FieldContent>
                  <Select
                    value={watched.source}
                    onValueChange={(v) => form.setValue('source', v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a source" />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_PRESETS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {watched.source === 'custom' && (
                    <Input
                      className="mt-2"
                      placeholder="e.g. newsletter, partner_site"
                      {...form.register('customSource')}
                    />
                  )}
                </FieldContent>
              </Field>

              <Field orientation="responsive">
                <div>
                  <FieldLabel>Medium</FieldLabel>
                  <FieldDescription>Marketing medium (auto-filled)</FieldDescription>
                </div>
                <FieldContent>
                  <Input placeholder="e.g. social, email, qr" {...form.register('medium')} />
                </FieldContent>
              </Field>

              <Field orientation="responsive">
                <div>
                  <FieldLabel>Campaign</FieldLabel>
                  <FieldDescription>Campaign name (optional)</FieldDescription>
                </div>
                <FieldContent>
                  <Input placeholder="e.g. summer_promo" {...form.register('campaign')} />
                </FieldContent>
              </Field>

              <Field orientation="responsive">
                <div>
                  <FieldLabel>Content</FieldLabel>
                  <FieldDescription>Ad variation or placement (optional)</FieldDescription>
                </div>
                <FieldContent>
                  <Input placeholder="e.g. hero_banner, story_ad" {...form.register('content')} />
                </FieldContent>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        {/* Generated URL */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generated URL</CardTitle>
          </CardHeader>
          <CardContent>
            {generatedUrl ? (
              <div className="space-y-3">
                <InputGroup>
                  <InputGroupInput readOnly value={generatedUrl} />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      onClick={() => copyToClipboard(generatedUrl)}
                      aria-label="Copy URL"
                    >
                      {isCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    </InputGroupButton>
                    <InputGroupButton
                      size="icon-xs"
                      onClick={() => window.open(generatedUrl, '_blank')}
                      aria-label="Open in new tab"
                    >
                      <ExternalLink className="size-3.5" />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>

                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">Base:</span>{' '}
                    {new URL(generatedUrl).origin + new URL(generatedUrl).pathname}
                  </p>
                  {Array.from(new URL(generatedUrl).searchParams.entries()).map(([key, val]) => (
                    <p key={key}>
                      <span className="font-medium text-foreground">{key}:</span> {val}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                <Link className="size-8" />
                <p>Select a source to generate a trackable URL</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export { MarketingPage as Component };

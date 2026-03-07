import { useState, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUser as useClerkUser } from '@clerk/clerk-react';
import posthog from 'posthog-js';
import { Camera, Loader2, LogOut, Mail, Trash2, Unlink } from 'lucide-react';
import { useAuth } from '@/auth/react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Separator } from '@/shared/components/ui/separator';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Spinner } from '@/shared/components/ui/spinner';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/shared/components/ui/field';
import { Badge } from '@/shared/components/ui/badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/shared/components/ui/empty';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
});
type ProfileFormData = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
type PasswordFormData = z.infer<typeof passwordSchema>;

// ─── Component ───────────────────────────────────────────────────────────────

export default function SettingsProfileTab() {
  const { user, isLoaded } = useClerkUser();

  if (!isLoaded) {
    return (
      <div className="space-y-8 p-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-full" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-8 p-4">
      <ProfileSection user={user} />
      <Separator />
      <EmailSection user={user} />
      <Separator />
      <ConnectedAccountsSection user={user} />
      {user.passwordEnabled && (
        <>
          <Separator />
          <PasswordSection user={user} />
        </>
      )}
      <Separator />
      <AccountSection user={user} />
    </div>
  );
}

// ─── Profile Section ─────────────────────────────────────────────────────────

function ProfileSection({ user }: { user: NonNullable<ReturnType<typeof useClerkUser>['user']> }) {
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
    },
  });

  const onSubmit = async (data: ProfileFormData) => {
    try {
      await user.update({ firstName: data.firstName, lastName: data.lastName });
      toast.success('Profile updated');
    } catch (err) {
      toast.error('Failed to update profile', {
        description: err instanceof Error ? err.message : 'Something went wrong',
      });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Invalid file type', { description: 'Please upload an image file' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large', { description: 'Maximum file size is 10 MB' });
      return;
    }

    setAvatarUploading(true);
    try {
      await user.setProfileImage({ file });
      toast.success('Avatar updated');
    } catch (err) {
      toast.error('Failed to upload avatar', {
        description: err instanceof Error ? err.message : 'Something went wrong',
      });
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const displayName = user.fullName || user.emailAddresses[0]?.emailAddress || 'User';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <section className="space-y-4">
      <h2 className="text-base font-medium">Profile</h2>
      <FieldGroup>
        <Field orientation="responsive">
          <FieldLabel>Photo</FieldLabel>
          <FieldContent>
            <div className="relative w-fit">
              <Avatar className="size-20">
                <AvatarImage src={user.imageUrl} alt={displayName} />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              {avatarUploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                  <Loader2 className="size-5 animate-spin text-white" />
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                <Camera className="size-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
          </FieldContent>
        </Field>
        <Controller
          name="firstName"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field orientation="responsive" data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="firstName">First name</FieldLabel>
              <FieldContent>
                <Input {...field} id="firstName" aria-invalid={fieldState.invalid} />
                <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
              </FieldContent>
            </Field>
          )}
        />
        <Controller
          name="lastName"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field orientation="responsive" data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="lastName">Last name</FieldLabel>
              <FieldContent>
                <Input {...field} id="lastName" aria-invalid={fieldState.invalid} />
                <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
              </FieldContent>
            </Field>
          )}
        />
      </FieldGroup>
      <Button
        onClick={form.handleSubmit(onSubmit)}
        disabled={form.formState.isSubmitting || !form.formState.isDirty}
      >
        {form.formState.isSubmitting && <Spinner className="mr-1 size-3" />}
        Save
      </Button>
    </section>
  );
}

// ─── Email Section ───────────────────────────────────────────────────────────

function EmailSection({ user }: { user: NonNullable<ReturnType<typeof useClerkUser>['user']> }) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-medium">Email</h2>
      {user.emailAddresses.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No email addresses</EmptyTitle>
            <EmptyDescription>No email addresses linked to this account.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div>
          {user.emailAddresses.map((email, i) => (
            <div key={email.id}>
              {i > 0 && <Separator />}
              <div className="flex items-center gap-3 py-2.5">
                <Mail className="size-4 text-muted-foreground" />
                <span className="text-sm">{email.emailAddress}</span>
                {email.id === user.primaryEmailAddressId && (
                  <Badge variant="secondary" className="ml-auto">
                    Primary
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Connected Accounts Section ──────────────────────────────────────────────

function ConnectedAccountsSection({
  user,
}: {
  user: NonNullable<ReturnType<typeof useClerkUser>['user']>;
}) {
  const accounts = user.externalAccounts;

  const providerLabels: Record<string, string> = {
    google: 'Google',
    github: 'GitHub',
    facebook: 'Facebook',
    apple: 'Apple',
    microsoft: 'Microsoft',
    discord: 'Discord',
  };

  const handleDisconnect = async (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    try {
      await account.destroy();
      toast.success('Account disconnected');
    } catch (err) {
      toast.error('Failed to disconnect account', {
        description: err instanceof Error ? err.message : 'Something went wrong',
      });
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-base font-medium">Connected accounts</h2>
      {accounts.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No connected accounts</EmptyTitle>
            <EmptyDescription>No external accounts linked.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div>
          {accounts.map((account, i) => (
            <div key={account.id}>
              {i > 0 && <Separator />}
              <div className="flex items-center gap-3 py-2.5">
                <span className="text-sm font-medium">
                  {providerLabels[account.provider] ?? account.provider}
                </span>
                <span className="text-sm text-muted-foreground">{account.emailAddress}</span>
                {accounts.length > 1 && (
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => handleDisconnect(account.id)}
                  >
                    <Unlink className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Password Section ────────────────────────────────────────────────────────

function PasswordSection({ user }: { user: NonNullable<ReturnType<typeof useClerkUser>['user']> }) {
  const form = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: PasswordFormData) => {
    try {
      await user.updatePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      form.reset();
      toast.success('Password updated');
    } catch (err) {
      toast.error('Failed to update password', {
        description: err instanceof Error ? err.message : 'Something went wrong',
      });
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Password</h2>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FieldGroup>
          <Controller
            name="currentPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field orientation="responsive" data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            name="newPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field orientation="responsive" data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="newPassword">New password</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            name="confirmPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field orientation="responsive" data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
                </FieldContent>
              </Field>
            )}
          />
          <Field orientation="responsive">
            <FieldLabel className="sr-only">Update password</FieldLabel>
            <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner className="mr-1 size-4" />}
              Update password
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </section>
  );
}

// ─── Account Section (Sign out + Delete) ─────────────────────────────────────

function AccountSection({ user }: { user: NonNullable<ReturnType<typeof useClerkUser>['user']> }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  const handleSignOut = async () => {
    posthog.reset();
    await signOut();
    navigate('/sign-in', { replace: true });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await user.delete();
      posthog.reset();
      navigate('/sign-in', { replace: true });
    } catch (err) {
      toast.error('Failed to delete account', {
        description: err instanceof Error ? err.message : 'Something went wrong',
      });
      setDeleting(false);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-base font-medium">Account</h2>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium">Sign out</CardTitle>
              <CardDescription>Sign out of your account on this device.</CardDescription>
            </div>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="mr-1 size-4" />
              Sign out
            </Button>
          </div>
        </CardHeader>
      </Card>
      <Card className="border-destructive/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium text-destructive">Delete account</CardTitle>
              <CardDescription>
                Permanently delete your account and all associated data.
              </CardDescription>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
                  <Trash2 className="mr-1 size-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete your account and all associated data. This action
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting && <Spinner className="mr-1 size-4" />}
                    Delete account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
      </Card>
    </section>
  );
}

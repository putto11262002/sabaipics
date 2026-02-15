import { useState } from 'react';
import { useParams } from 'react-router';
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/shared/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/shared/components/ui/input-group';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useFtpCredentials, useRevealFtpCredentials } from '../../../../hooks/events/useFtpCredentials';
import { useCopyToClipboard } from '../../../../hooks/use-copy-to-clipboard';

export default function EventFtpTab() {
  const { id } = useParams<{ id: string }>();
  const ftpCredentials = useFtpCredentials(id);
  const revealCredentials = useRevealFtpCredentials(id);
  const { copyToClipboard } = useCopyToClipboard();

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [isUsernameCopied, setIsUsernameCopied] = useState(false);
  const [isPasswordCopied, setIsPasswordCopied] = useState(false);

  const handleCopyUsername = async () => {
    if (!ftpCredentials.data?.username) return;
    const ok = await copyToClipboard(ftpCredentials.data.username);
    if (!ok) return;
    setIsUsernameCopied(true);
    setTimeout(() => setIsUsernameCopied(false), 2000);
  };

  const handleRevealPassword = () => {
    if (!isPasswordVisible) {
      revealCredentials.mutate(undefined, {
        onSuccess: (result) => {
          setRevealedPassword(result.password);
          setIsPasswordVisible(true);
        },
      });
      return;
    }
    setIsPasswordVisible(false);
  };

  const handleCopyPassword = async () => {
    if (!revealedPassword) return;
    const ok = await copyToClipboard(revealedPassword);
    if (!ok) return;
    setIsPasswordCopied(true);
    setTimeout(() => setIsPasswordCopied(false), 2000);
  };

  const passwordValue = isPasswordVisible
    ? (revealedPassword ?? '')
    : (revealedPassword ?? (ftpCredentials.data?.username ? '************' : ''));

  const passwordPlaceholder =
    isPasswordVisible && revealCredentials.isPending
      ? 'Loading...'
      : !ftpCredentials.data?.username
        ? 'Not available'
        : '';

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <section className="space-y-4">
        <h2 className="text-base font-medium">FTP credentials</h2>
        <p className="text-sm text-muted-foreground">Use these credentials to upload photos via FTP.</p>
        <FieldGroup>
          <Field orientation="responsive">
            <FieldLabel>Username</FieldLabel>
            <FieldContent>
              <InputGroup>
                <InputGroupInput
                  readOnly
                  value={ftpCredentials.data?.username ?? 'Not available'}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label={isUsernameCopied ? 'Copied username' : 'Copy username'}
                    title={isUsernameCopied ? 'Copied!' : 'Copy username'}
                    size="icon-xs"
                    onClick={handleCopyUsername}
                    disabled={!ftpCredentials.data?.username}
                  >
                    {isUsernameCopied ? <Check /> : <Copy />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </FieldContent>
          </Field>
          <Field orientation="responsive">
            <FieldLabel>Password</FieldLabel>
            <FieldContent>
              <InputGroup>
                <InputGroupInput
                  readOnly
                  type={isPasswordVisible ? 'text' : 'password'}
                  value={passwordValue}
                  placeholder={passwordPlaceholder}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label={isPasswordVisible ? 'Hide password' : 'Reveal password'}
                    title={isPasswordVisible ? 'Hide password' : 'Reveal password'}
                    size="icon-xs"
                    onClick={handleRevealPassword}
                    disabled={!ftpCredentials.data?.username || revealCredentials.isPending}
                  >
                    {isPasswordVisible ? <EyeOff /> : <Eye />}
                  </InputGroupButton>
                  <InputGroupButton
                    aria-label={isPasswordCopied ? 'Copied password' : 'Copy password'}
                    title={isPasswordCopied ? 'Copied!' : 'Copy password'}
                    size="icon-xs"
                    onClick={handleCopyPassword}
                    disabled={!revealedPassword}
                  >
                    {isPasswordCopied ? <Check /> : <Copy />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </FieldContent>
          </Field>
        </FieldGroup>
      </section>
    </div>
  );
}

type CauseLogMeta = {
  has_cause: boolean;
  cause_type?: string;
  cause_code?: string;
  cause_message?: string;
};

const MAX_CAUSE_MESSAGE_LENGTH = 200;

function sanitizeMessage(input: string): string {
  // Redact obvious bearer/basic secrets in free-form messages.
  return input
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]');
}

function trimMessage(input: string): string {
  if (input.length <= MAX_CAUSE_MESSAGE_LENGTH) return input;
  return `${input.slice(0, MAX_CAUSE_MESSAGE_LENGTH)}...`;
}

export function getSafeCauseMeta(cause: unknown): CauseLogMeta {
  if (!cause) {
    return { has_cause: false };
  }

  if (cause instanceof Error) {
    return {
      has_cause: true,
      cause_type: cause.name || 'Error',
      cause_message: trimMessage(sanitizeMessage(cause.message || '')),
    };
  }

  if (typeof cause === 'object' && cause !== null) {
    const record = cause as Record<string, unknown>;
    const code = typeof record.code === 'string' ? record.code : undefined;
    const message = typeof record.message === 'string' ? record.message : undefined;
    const ctorName =
      (record.constructor as { name?: string } | undefined)?.name || 'Object';

    return {
      has_cause: true,
      cause_type: ctorName,
      cause_code: code,
      cause_message: message ? trimMessage(sanitizeMessage(message)) : undefined,
    };
  }

  return {
    has_cause: true,
    cause_type: typeof cause,
    cause_message: trimMessage(sanitizeMessage(String(cause))),
  };
}

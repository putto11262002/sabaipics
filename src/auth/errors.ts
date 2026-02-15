export const AUTH_ERRORS = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  FORBIDDEN: "FORBIDDEN",
} as const;

export type AuthErrorResponse = {
  error: {
    code: keyof typeof AUTH_ERRORS;
    message: string;
  };
};

export function createAuthError(
  code: keyof typeof AUTH_ERRORS,
  message: string,
): AuthErrorResponse {
  return { error: { code: AUTH_ERRORS[code], message } };
}

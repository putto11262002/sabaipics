export type AuthObject = {
  userId: string;
  sessionId: string;
};

export type AuthBindings = {
  CLERK_SECRET_KEY: string; // For creating Clerk client
  CLERK_PUBLISHABLE_KEY: string; // For creating Clerk client
  CLERK_JWT_KEY: string; // PEM public key for networkless verification
  AUTHORIZED_PARTIES: string; // comma-separated
};

export type AuthVariables = {
  auth: AuthObject | null;
};

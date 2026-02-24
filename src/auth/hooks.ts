import {
  useAuth as useClerkAuth,
  useUser as useClerkUser,
  useClerk as useClerkInstance,
} from '@clerk/clerk-react';

/**
 * Custom types - Our own interface, not Clerk's
 * This allows us to swap auth providers without changing consumer code
 */

export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string;
  emailAddresses: Array<{ emailAddress: string }>;
}

export interface AuthState {
  userId: string | null;
  sessionId: string | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut: () => Promise<void>;
  getToken: (options?: { template?: string }) => Promise<string | null>;
}

/**
 * useAuth - Wrapper around Clerk's useAuth
 *
 * Returns our own AuthState interface instead of Clerk's types.
 * This makes it easier to swap auth providers in the future.
 */
export function useAuth(): AuthState {
  const clerk = useClerkAuth();

  return {
    userId: clerk.userId ?? null,
    sessionId: clerk.sessionId ?? null,
    isLoaded: clerk.isLoaded ?? false,
    isSignedIn: clerk.isSignedIn ?? false,
    signOut: () => clerk.signOut(),
    getToken: (options) => clerk.getToken(options),
  };
}

/**
 * useUser - Wrapper around Clerk's useUser
 *
 * Returns our own User interface instead of Clerk's UserResource type.
 * Adapts Clerk's user object to our simpler interface.
 */
export function useUser() {
  const { user: clerkUser, isLoaded } = useClerkUser();

  if (!clerkUser) {
    return { user: null, isLoaded };
  }

  return {
    user: {
      id: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress ?? '',
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      fullName: clerkUser.fullName,
      imageUrl: clerkUser.imageUrl,
      emailAddresses: clerkUser.emailAddresses.map((e) => ({
        emailAddress: e.emailAddress,
      })),
    } as User,
    isLoaded,
  };
}

/**
 * useClerk - Access Clerk instance for advanced operations
 *
 * Provides access to Clerk methods like openUserProfile(), signOut(), etc.
 */
export function useClerk() {
  const clerk = useClerkInstance();

  return {
    openUserProfile: () => clerk.openUserProfile(),
    openSignIn: () => clerk.openSignIn(),
    openSignUp: () => clerk.openSignUp(),
    signOut: () => clerk.signOut(),
  };
}

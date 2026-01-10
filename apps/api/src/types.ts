import type { AuthVariables } from "@sabaipics/auth/types";
import type { Database } from "@sabaipics/db";

// Extend CloudflareBindings with secrets not in wrangler.jsonc
export type Bindings = CloudflareBindings & {
  ADMIN_API_KEY: string;
};

export type Variables = AuthVariables & {
  db: () => Database;
};

export type Env = { Bindings: Bindings; Variables: Variables };

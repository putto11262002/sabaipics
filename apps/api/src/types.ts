import type { AuthVariables } from "@sabaipics/auth/types";
import type { Database } from "@sabaipics/db";

// Bindings are auto-generated from wrangler.jsonc via: pnpm cf-typegen
// Additional secrets are typed from .dev.vars (local) and .dev.vars.example (documentation)
export type Bindings = CloudflareBindings;

export type Variables = AuthVariables & {
  db: () => Database;
};

export type Env = { Bindings: Bindings; Variables: Variables };

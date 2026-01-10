import type { AuthVariables } from "@sabaipics/auth/types";
import type { Database } from "@sabaipics/db";

export type Bindings = CloudflareBindings;

export type Variables = AuthVariables & {
  db: () => Database;
};

export type Env = { Bindings: Bindings; Variables: Variables };

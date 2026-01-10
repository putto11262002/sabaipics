import { Hono } from "hono";
import { adminCreditPackagesRouter } from "./credit-packages";
import type { Database } from "@sabaipics/db";

type Bindings = {
  ADMIN_API_KEY: string;
};

type Variables = {
  db: () => Database;
};

type Env = { Bindings: Bindings; Variables: Variables };

export const adminRouter = new Hono<Env>().route(
  "/credit-packages",
  adminCreditPackagesRouter
);

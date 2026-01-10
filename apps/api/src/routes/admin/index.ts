import { Hono } from "hono";
import { adminCreditPackagesRouter } from "./credit-packages";
import type { Env } from "../../types";

export const adminRouter = new Hono<Env>().route(
  "/credit-packages",
  adminCreditPackagesRouter
);

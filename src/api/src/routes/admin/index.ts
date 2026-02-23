import { Hono } from "hono";
import { giftCodesRouter } from "./gift-codes";
import { discountCodesRouter } from "./discount-codes";
import { adminUsersRouter } from "./users";
import { adminSettingsRouter } from "./settings";
import type { Env } from "../../types";

export const adminRouter = new Hono<Env>()
  .route("/gift-codes", giftCodesRouter)
  .route("/discount-codes", discountCodesRouter)
  .route("/users", adminUsersRouter)
  .route("/settings", adminSettingsRouter);

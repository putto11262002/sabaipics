import { Hono } from "hono";
import { adminCreditPackagesRouter } from "./credit-packages";
import { creditTokensRouter } from "./credit-tokens";
import { giftCodesRouter } from "./gift-codes";
import { discountCodesRouter } from "./discount-codes";
import { adminUsersRouter } from "./users";
import { giftCodesV2Router } from "./gift-codes-v2";
import type { Env } from "../../types";

export const adminRouter = new Hono<Env>()
  .route("/credit-packages", adminCreditPackagesRouter)
  .route("/credit-tokens", creditTokensRouter)
  .route("/gift-codes", giftCodesRouter)
  .route("/discount-codes", discountCodesRouter)
  .route("/users", adminUsersRouter)
  .route("/gift-codes-v2", giftCodesV2Router);

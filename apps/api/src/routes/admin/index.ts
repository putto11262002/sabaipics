import { Hono } from "hono";
import { adminCreditPackagesRouter } from "./credit-packages";
import { creditTokensRouter } from "./credit-tokens";
import { giftCodesRouter } from "./gift-codes";
import { discountCodesRouter } from "./discount-codes";
import type { Env } from "../../types";

export const adminRouter = new Hono<Env>()
  .route("/credit-packages", adminCreditPackagesRouter)
  .route("/credit-tokens", creditTokensRouter)
  .route("/gift-codes", giftCodesRouter)
  .route("/discount-codes", discountCodesRouter);

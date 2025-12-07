import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { dbTest } from "./schema";

// Test table types
export type DbTest = InferSelectModel<typeof dbTest>;
export type NewDbTest = InferInsertModel<typeof dbTest>;

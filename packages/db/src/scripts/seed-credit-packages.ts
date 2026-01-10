#!/usr/bin/env node
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { creditPackages } from "../schema/credit-packages";

/**
 * Seed script for credit packages
 *
 * Usage:
 * DATABASE_URL=postgres://... pnpm tsx src/scripts/seed-credit-packages.ts
 */

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const packages = [
  {
    name: "Starter",
    credits: 100,
    priceThb: 29900, // 299 THB in satang
    active: true,
    sortOrder: 1,
  },
  {
    name: "Growth",
    credits: 500,
    priceThb: 99900, // 999 THB in satang
    active: true,
    sortOrder: 2,
  },
  {
    name: "Professional",
    credits: 1500,
    priceThb: 249900, // 2,499 THB in satang
    active: true,
    sortOrder: 3,
  },
  {
    name: "Studio",
    credits: 5000,
    priceThb: 699900, // 6,999 THB in satang
    active: true,
    sortOrder: 4,
  },
];

async function seed() {
  console.log("🌱 Seeding credit packages...");

  for (const pkg of packages) {
    console.log(`  → ${pkg.name}: ${pkg.credits} credits for ฿${pkg.priceThb / 100}`);
    await db.insert(creditPackages).values(pkg).onConflictDoNothing();
  }

  console.log("✅ Credit packages seeded successfully!");
}

seed().catch((error) => {
  console.error("❌ Error seeding credit packages:", error);
  process.exit(1);
});

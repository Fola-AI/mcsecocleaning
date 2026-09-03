import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton — avoids exhausting connections during dev HMR and in
 * serverless (Vercel). Import `db` everywhere rather than newing PrismaClient.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** True when a database connection string is configured. */
export const hasDatabase = Boolean(
  process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("user:password@localhost")
);

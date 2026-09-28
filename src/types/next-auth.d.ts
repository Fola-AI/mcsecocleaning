import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Expose the user's id and role on the session (set in the session callback).
declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
  interface User {
    role: Role;
  }
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { crewSignOut } from "@/app/actions/crew";

/**
 * Sign out (§9.2, shared-device safe).
 *
 * Always visible, one tap, no confirmation: on a shared phone the cost of an
 * accidental sign-out is typing a PIN, and the cost of a missed one is the next
 * person holding someone else's session. It ends the session on the server, not
 * just in this browser.
 */
export function CrewSignOutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      className="rounded-lg border border-line px-3 py-2 text-sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await crewSignOut();
          router.push("/crew/signin");
          router.refresh();
        })
      }
    >
      {pending ? "…" : "Sign out"}
    </button>
  );
}

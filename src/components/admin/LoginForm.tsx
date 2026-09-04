"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAdmin } from "@/app/actions/admin";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Checking…" : "Sign in"}
    </button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(loginAdmin, null);
  return (
    <form action={action} className="card space-y-4 p-6">
      <div>
        <label htmlFor="code" className="block text-sm font-semibold">Admin access code</label>
        <input id="code" name="code" type="password" autoComplete="off" className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5" />
      </div>
      {state?.error && <p className="text-sm text-error" role="alert">{state.error}</p>}
      <Submit />
    </form>
  );
}

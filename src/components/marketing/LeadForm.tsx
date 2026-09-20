"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitLead, type LeadState } from "@/app/actions/leads";

const initial: LeadState = { status: "idle" };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? "Sending…" : label}
    </button>
  );
}

export function LeadForm({
  enquiry = "general",
  defaultPostcode = "",
  job,
  showPostcode = true,
  showMessage = true,
  submitLabel = "Send enquiry",
  consentLabel = "Email me occasional offers and cleaning tips. You can unsubscribe any time.",
}: {
  enquiry?: string;
  defaultPostcode?: string;
  /** Structured job (JSON string) carried from an escalated booking, stored on the Lead. */
  job?: string;
  showPostcode?: boolean;
  showMessage?: boolean;
  submitLabel?: string;
  consentLabel?: string;
}) {
  const [state, formAction] = useActionState(submitLead, initial);

  if (state.status === "success") {
    return (
      <div className="card p-6 text-center" role="status">
        <div className="text-3xl" aria-hidden>✅</div>
        <p className="mt-3 font-semibold text-brand-ink">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-4 p-6" noValidate>
      <input type="hidden" name="enquiry" value={enquiry} />
      {job && <input type="hidden" name="job" value={job} />}
      {/* Honeypot */}
      <div aria-hidden className="hidden">
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state.status === "error" && (
        <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error" role="alert">
          {state.message}
        </p>
      )}

      <Field label="Your name" name="name" error={fieldError(state, "name")} required />
      <Field label="Email" name="email" type="email" error={fieldError(state, "email")} required />
      <Field label="Phone (optional)" name="phone" type="tel" error={fieldError(state, "phone")} />
      {showPostcode && (
        <Field
          label="Postcode"
          name="postcode"
          defaultValue={defaultPostcode}
          error={fieldError(state, "postcode")}
        />
      )}
      {showMessage && (
        <div>
          <label htmlFor="lf-message" className="block text-sm font-semibold">
            How can we help?
          </label>
          <textarea
            id="lf-message"
            name="message"
            rows={4}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5"
          />
        </div>
      )}

      <label className="flex items-start gap-2 text-sm text-ink-soft">
        <input type="checkbox" name="marketingConsent" className="mt-1" />
        <span>{consentLabel}</span>
      </label>

      <SubmitButton label={submitLabel} />
      <p className="text-xs text-ink-soft">
        By submitting you agree to our{" "}
        <Link href="/privacy" className="underline">privacy notice</Link>. We never share your details.
      </p>
    </form>
  );
}

function fieldError(state: LeadState, name: string): string | undefined {
  return state.status === "error" ? state.fieldErrors?.[name] : undefined;
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  defaultValue,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  error?: string;
}) {
  const id = `lf-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label} {required && <span className="text-error">*</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5"
      />
      {error && (
        <p id={`${id}-err`} className="mt-1 text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMyProperty } from "@/app/actions/account";

interface Props {
  property: {
    id: string;
    addressLine1: string;
    entryMethod: string;
    parkingNotes: string;
    accessNotes: string;
    doNotTouch: string;
    hasLockboxCode: boolean;
    hasAlarmCode: boolean;
  };
  codesEnabled: boolean;
}

const ENTRY_METHODS = [
  ["", "—"],
  ["client_present", "I'll be home"],
  ["key_held", "You hold a key"],
  ["lockbox", "Lockbox / key safe"],
  ["key_safe", "Key safe"],
  ["concierge", "Concierge"],
] as const;

/** Access codes are WRITE-ONLY: the current value is never shown (only whether one
 *  is set); a blank field leaves it unchanged; a new value is re-encrypted on save. */
export function PropertyEditForm({ property, codesEnabled }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({
    addressLine1: property.addressLine1,
    entryMethod: property.entryMethod,
    parkingNotes: property.parkingNotes,
    accessNotes: property.accessNotes,
    doNotTouch: property.doNotTouch,
    newLockboxCode: "",
    newAlarmCode: "",
  });

  const save = () =>
    start(async () => {
      const res = await updateMyProperty(property.id, f);
      setMsg(res.message);
      if (res.ok) {
        setF((s) => ({ ...s, newLockboxCode: "", newAlarmCode: "" }));
        router.refresh();
      }
    });

  const field = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5";

  return (
    <div className="mt-6 space-y-4">
      <label className="block text-sm font-semibold">Address line 1
        <input className={field} value={f.addressLine1} onChange={(e) => setF({ ...f, addressLine1: e.target.value })} />
      </label>
      <label className="block text-sm font-semibold">How we get in
        <select className={field} value={f.entryMethod} onChange={(e) => setF({ ...f, entryMethod: e.target.value })}>
          {ENTRY_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="block text-sm font-semibold">Parking notes
        <textarea className={field} rows={2} value={f.parkingNotes} onChange={(e) => setF({ ...f, parkingNotes: e.target.value })} />
      </label>
      <label className="block text-sm font-semibold">Access notes
        <textarea className={field} rows={2} value={f.accessNotes} onChange={(e) => setF({ ...f, accessNotes: e.target.value })} />
      </label>
      <label className="block text-sm font-semibold">Anything we should not touch
        <textarea className={field} rows={2} value={f.doNotTouch} onChange={(e) => setF({ ...f, doNotTouch: e.target.value })} />
      </label>

      {codesEnabled && (
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-sm font-semibold">Entry codes (stored encrypted)</legend>
          <p className="text-xs text-ink-soft">
            For security we never show a saved code. Leave a field blank to keep the current code; enter a new value to replace it.
          </p>
          <label className="mt-3 block text-sm">Lockbox code {property.hasLockboxCode ? "(a code is set)" : "(none set)"}
            <input className={field} autoComplete="off" placeholder="Leave blank to keep current" value={f.newLockboxCode} onChange={(e) => setF({ ...f, newLockboxCode: e.target.value })} />
          </label>
          <label className="mt-3 block text-sm">Alarm code {property.hasAlarmCode ? "(a code is set)" : "(none set)"}
            <input className={field} autoComplete="off" placeholder="Leave blank to keep current" value={f.newAlarmCode} onChange={(e) => setF({ ...f, newAlarmCode: e.target.value })} />
          </label>
        </fieldset>
      )}

      <button className="btn btn-primary" disabled={pending} onClick={save}>
        {pending ? "Saving…" : "Save changes"}
      </button>
      {msg && <p className="text-sm text-ink-soft" aria-live="polite">{msg}</p>}
    </div>
  );
}

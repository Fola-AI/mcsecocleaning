import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { accessCodeEncryptionAvailable } from "@/lib/access-codes";
import { PropertyEditForm } from "@/components/account/PropertyEditForm";

export const metadata: Metadata = { title: "Edit property", robots: { index: false, follow: false } };

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: customerId } = await requireCustomer();
  const { id } = await params;

  // Scoped to the customer. Select code PRESENCE only — the ciphertext never leaves
  // the server and is never decrypted to the page (§9.3).
  const p = hasDatabase
    ? await db.property.findFirst({
        where: { id, customerId },
        select: {
          id: true, addressLine1: true, entryMethod: true, parkingNotes: true,
          accessNotes: true, doNotTouch: true, accessCodeEncrypted: true, alarmCodeEncrypted: true,
        },
      })
    : null;

  if (!p) {
    return (
      <div className="container-page max-w-2xl py-12">
        <p className="text-ink-soft">Property not found.</p>
        <Link href="/account" className="mt-4 inline-block underline">Back to your account</Link>
      </div>
    );
  }

  return (
    <div className="container-page max-w-2xl py-12">
      <Link href="/account" className="text-sm text-ink-soft hover:text-ink">← Back to your account</Link>
      <h1 className="mt-2 text-2xl font-bold">Edit property</h1>
      <PropertyEditForm
        property={{
          id: p.id,
          addressLine1: p.addressLine1 ?? "",
          entryMethod: p.entryMethod ?? "",
          parkingNotes: p.parkingNotes ?? "",
          accessNotes: p.accessNotes ?? "",
          doNotTouch: p.doNotTouch ?? "",
          hasLockboxCode: Boolean(p.accessCodeEncrypted),
          hasAlarmCode: Boolean(p.alarmCodeEncrypted),
        }}
        codesEnabled={accessCodeEncryptionAvailable()}
      />
    </div>
  );
}

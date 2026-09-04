import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { ImportClients } from "@/components/admin/ImportClients";

export const metadata: Metadata = { title: "Import clients", robots: { index: false, follow: false } };

export default async function AdminImportPage() {
  await requireAdmin();
  return (
    <AdminShell title="Import clients">
      <ImportClients />
    </AdminShell>
  );
}

import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { ImportClients } from "@/components/admin/ImportClients";

export const metadata: Metadata = { title: "Import clients", robots: { index: false, follow: false } };

export default async function AdminImportPage() {
  await requireRole(["owner", "admin", "supervisor"]);
  return (
    <AdminShell title="Import clients">
      <ImportClients />
    </AdminShell>
  );
}

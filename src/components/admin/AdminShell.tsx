import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAdmin } from "@/app/actions/admin";

const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/bookings/new", label: "New booking" },
  { href: "/admin/import", label: "Import clients" },
];

export function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="border-b border-line bg-brand-ink text-white">
        <div className="container-page flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold">mcseco admin</span>
            <nav className="hidden gap-4 text-sm sm:flex">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="text-white/80 hover:text-white">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <form action={logoutAdmin}>
            <button className="text-sm text-white/80 hover:text-white">Sign out</button>
          </form>
        </div>
      </div>
      <div className="container-page py-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

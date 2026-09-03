import Link from "next/link";

export function PageHeader({
  eyebrow,
  title,
  intro,
  crumbs,
}: {
  eyebrow?: string;
  title: string;
  intro?: string;
  crumbs?: { name: string; path: string }[];
}) {
  return (
    <header className="border-b border-line bg-brand-tint/40">
      <div className="container-page py-12 md:py-16">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-soft">
            {crumbs.map((c, i) => (
              <span key={c.path}>
                {i > 0 && <span aria-hidden> / </span>}
                {i < crumbs.length - 1 ? (
                  <Link href={c.path} className="hover:underline">
                    {c.name}
                  </Link>
                ) : (
                  <span className="text-ink">{c.name}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 max-w-3xl text-4xl font-bold md:text-5xl">{title}</h1>
        {intro && <p className="mt-4 max-w-2xl text-lg text-ink-soft">{intro}</p>}
      </div>
    </header>
  );
}

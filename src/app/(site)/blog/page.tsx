import Link from "next/link";
import type { Metadata } from "next";
import { blogPosts } from "@/content/blog";
import { buildMetadata } from "@/lib/seo/metadata";
import { PageHeader } from "@/components/marketing/PageHeader";
import { Section } from "@/components/marketing/Section";

export const metadata: Metadata = buildMetadata({
  title: "Cleaning guides & advice",
  description:
    "Practical guides on cleaning costs, end of tenancy checklists, deep cleaning, eco products and more — from the mcsecocleaning team.",
  path: "/blog",
});

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" });

export default function BlogIndexPage() {
  const posts = [...blogPosts].sort((a, b) => +new Date(b.date) - +new Date(a.date));

  return (
    <>
      <PageHeader
        eyebrow="Cleaning guides"
        title="Advice worth reading"
        intro="Straight answers on what cleaning costs, how to protect your deposit, and how to keep a home genuinely clean — without the jargon."
        crumbs={[{ name: "Home", path: "/" }, { name: "Guides", path: "/blog" }]}
      />

      <Section>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <article key={post.slug} className="card flex flex-col p-6">
              <div className="flex flex-wrap gap-2">
                {post.tags.slice(0, 2).map((t) => (
                  <span key={t} className="rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-semibold text-brand-ink">
                    {t}
                  </span>
                ))}
              </div>
              <h2 className="mt-3 text-lg font-bold">
                <Link href={`/blog/${post.slug}`} className="hover:text-brand-strong">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-2 flex-1 text-sm text-ink-soft">{post.excerpt}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-ink-soft">
                <time dateTime={post.date}>{dateFmt.format(new Date(post.date))}</time>
                <span>{post.readingMinutes} min read</span>
              </div>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}

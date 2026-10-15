import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { blogPosts, postBySlug, type Block } from "@/content/blog";
import { site } from "@/config/site";
import { buildMetadata } from "@/lib/seo/metadata";
import { JsonLd, breadcrumbLd } from "@/lib/seo/jsonld";
import { PageHeader } from "@/components/marketing/PageHeader";
import { Section } from "@/components/marketing/Section";
import { CtaBanner } from "@/components/marketing/CtaBanner";

export const dynamicParams = false;

export function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) return {};
  return buildMetadata({ title: post.title, description: post.excerpt, path: `/blog/${post.slug}` });
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" });

function renderBlock(block: Block, i: number) {
  switch (block.type) {
    case "h2":
      return <h2 key={i}>{block.text}</h2>;
    case "h3":
      return <h3 key={i}>{block.text}</h3>;
    case "p":
      return <p key={i}>{block.text}</p>;
    case "ul":
      return (
        <ul key={i}>
          {block.items.map((it, j) => (
            <li key={j}>{it}</li>
          ))}
        </ul>
      );
    case "callout":
      return (
        <p key={i} className="rounded-lg border-l-4 border-brand bg-brand-tint/60 px-4 py-3 not-italic">
          {block.text}
        </p>
      );
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) notFound();

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    author: { "@type": "Organization", name: site.company.registeredName },
    publisher: { "@id": `${site.url}/#organization` },
    mainEntityOfPage: `${site.url}/blog/${post.slug}`,
  };

  return (
    <>
      <JsonLd
        data={[
          articleLd,
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "Guides", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />
      <PageHeader
        eyebrow="Cleaning guide"
        title={post.title}
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Guides", path: "/blog" },
          { name: post.title, path: `/blog/${post.slug}` },
        ]}
      />

      <Section>
        <div className="flex items-center gap-3 text-sm text-ink-soft">
          <time dateTime={post.date}>{dateFmt.format(new Date(post.date))}</time>
          <span aria-hidden>·</span>
          <span>{post.readingMinutes} min read</span>
        </div>

        <article className="prose-local mt-6">{post.body.map(renderBlock)}</article>

        {post.leadMagnet && (
          <div className="mt-8 rounded-xl border border-brand/30 bg-brand-tint p-6">
            <p className="font-bold text-brand-ink">{post.leadMagnet.label}</p>
            <p className="mt-1 text-sm text-brand-ink/80">
              Enter your email and we&apos;ll send it over.
            </p>
            <Link href="/contact?enquiry=checklist" className="btn btn-primary mt-4">
              Get the checklist
            </Link>
          </div>
        )}
      </Section>

      <CtaBanner />
    </>
  );
}

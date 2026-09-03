import { site } from "@/config/site";
import { orderedServices } from "@/config/services";
import { areas } from "@/config/areas";
import { blogPosts } from "@/content/blog";

/**
 * llms.txt (§5.1) — AI assistants are a growing local-discovery channel.
 * Served at /llms.txt. Plain, structured Markdown pointing at our key pages.
 */
export const dynamic = "force-static";

export function GET() {
  const lines: string[] = [];
  lines.push(`# ${site.name}`);
  lines.push("");
  lines.push(`> ${site.description}`);
  lines.push("");
  lines.push(
    `${site.company.registeredName} is a UK eco-friendly cleaning company operating its own crews. ` +
      `Transparent published pricing, before/after photographic proof of work, and a re-clean guarantee. ` +
      `Serving ${areas.filter((a) => a.active).map((a) => a.name).join(", ")}.`
  );
  lines.push("");
  lines.push("## Services");
  for (const s of orderedServices) {
    lines.push(`- [${s.name}](${site.url}/${s.slug}): ${s.tagline}`);
  }
  lines.push("");
  lines.push("## Areas we cover");
  for (const a of areas.filter((a) => a.active)) {
    lines.push(`- [${a.name}](${site.url}/areas-we-cover) — ${a.postcodeDistricts.join(", ")}`);
  }
  lines.push("");
  lines.push("## Guides");
  for (const p of blogPosts) {
    lines.push(`- [${p.title}](${site.url}/blog/${p.slug}): ${p.excerpt}`);
  }
  lines.push("");
  lines.push("## Contact");
  lines.push(`- Phone: ${site.contact.phoneDisplay}`);
  lines.push(`- Email: ${site.contact.email}`);
  lines.push(`- Book online: ${site.url}/book`);
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

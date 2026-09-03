import Link from "next/link";

export default function NotFound() {
  return (
    <section className="container-page py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-4xl font-bold">We couldn&apos;t find that page</h1>
      <p className="mx-auto mt-3 max-w-md text-ink-soft">
        The page may have moved. Try one of these instead.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn btn-primary">Home</Link>
        <Link href="/prices" className="btn btn-outline">Prices</Link>
        <Link href="/book" className="btn btn-outline">Get a price</Link>
      </div>
    </section>
  );
}

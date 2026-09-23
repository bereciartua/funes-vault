import Link from "next/link";
export default function NotFound() {
  return (
    <section aria-labelledby="not-found-heading">
      <h1 id="not-found-heading">Page not found</h1>
      <p>This page is no longer available.</p>
      <Link href="/vault">Return to your vault</Link>
    </section>
  );
}

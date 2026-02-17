import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer-text">
      <span className="text-footer-accent">
        &copy; {new Date().getFullYear()} Staxed. All rights reserved.
      </span>
      <nav className="footer-links" aria-label="Legal and accessibility links">
        <Link href="/privacy">Privacy Policy</Link>
        <span aria-hidden="true">&middot;</span>
        <Link href="/accessibility">Accessibility</Link>
      </nav>
    </footer>
  );
}

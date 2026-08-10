import Link from "next/link";

/** Module-scope — avoids request-time Date (Cache Components / static shell). */
const COPYRIGHT_YEAR = 2026;

export const Footer = () => {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2">
            <span className="font-semibold">chss.chat</span>
            <span className="text-sm text-muted-foreground">
              © {COPYRIGHT_YEAR}
            </span>
          </div>
          <nav
            className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground"
            aria-label="Footer"
          >
            <Link
              href="/research/compression"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Compression research
            </Link>
            <Link
              href="/p/"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              New game
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};

import { Button } from "@/components/ui/button";
import { LinkUnfurl } from "@/components/link-unfurl";
import { ArrowRightCircle } from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="[font-family:var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif]">
      <section className="relative flex min-h-[100svh] items-center overflow-hidden">
        <div className="container mx-auto px-4 py-16">
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="order-1 space-y-8 text-center lg:order-2">
              <div className="space-y-4">
                <h1 className="font-serif text-4xl leading-[1.05] tracking-tighter text-balance md:text-5xl lg:text-6xl">
                  Chess that lives in the link you share
                </h1>
                <p className="text-lg leading-relaxed text-pretty text-muted-foreground">
                  Make a move, send the URL. Your chat unfurls the board from
                  their perspective. No download, no sign up.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button size="lg" className="text-lg px-8 py-6" asChild>
                  <Link href="/p/">Start a new game</Link>
                </Button>
                <Link
                  href="/p/?p=b"
                  className="inline-flex h-auto items-center justify-center gap-1.5 px-8 py-6 text-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  tabIndex={0}
                  aria-label="Start a new game as black"
                >
                  <span className="underline underline-offset-4 [text-decoration-skip-ink:none]">
                    or start as{" "}
                    <span className="text-black dark:text-foreground">
                      black
                    </span>
                  </span>
                  <ArrowRightCircle
                    className="size-5 shrink-0"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </Link>
              </div>
            </div>

            <div className="order-2 flex justify-center lg:order-1">
              <LinkUnfurl />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

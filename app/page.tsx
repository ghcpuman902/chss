import { Button } from "@/components/ui/button";
import { LinkUnfurl } from "@/components/link-unfurl";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="[font-family:var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif]">
      <section className="relative overflow-hidden">
        <div className="container mx-auto px-4 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div className="space-y-8 lg:pt-4">
              <div className="space-y-4">
                <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl leading-[1.05] tracking-tighter text-balance">
                  Chess that lives in the link you share
                </h1>
                <p className="text-lg text-muted-foreground text-pretty leading-relaxed">
                  Make a move, send the URL. Your chat unfurls the board from
                  their perspective. No download, no sign up.
                </p>
              </div>

              <div className="space-y-4">
                <Button size="lg" className="text-lg px-8 py-6" asChild>
                  <Link href="/p/">Start a new game</Link>
                </Button>
                <div className="text-center lg:text-left">
                  <Button
                    variant="link"
                    className="text-muted-foreground hover:text-foreground"
                    asChild
                  >
                    <Link href="/p/?p=b">or start as black →</Link>
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-center lg:justify-end">
              <LinkUnfurl />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

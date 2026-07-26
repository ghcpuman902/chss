"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  Message,
  MessageContent,
  MessageGroup,
} from "@/components/ui/message";
import { buildOgCode } from "@/lib/og-encoding";
import { buildShareTitle } from "@/lib/share-title";
import { cn } from "@/lib/utils";

/** Position after 1.e4 e5 2.Nf3. Black to move, board shown from Black's side. */
const FEN_AFTER_NF3 =
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";

const EXAMPLE_PATH = "/p/e2e4e7e5g1f3";

const OG_SRC = `/og/${buildOgCode(FEN_AFTER_NF3, "b")}.png`;
const SHARE_TITLE = buildShareTitle("b", "f3");

type Step = "incoming" | "typing" | "preview";

const TIMELINE: { at: number; step: Step }[] = [
  { at: 0, step: "incoming" },
  { at: 900, step: "typing" },
  { at: 1700, step: "preview" },
];

const LOOP_MS = 6000;

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReduced(mq.matches);
    handleChange();
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  return reduced;
};

const Enter = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "animate-in fade-in duration-300 ease-out",
      className,
    )}
  >
    {children}
  </div>
);

const TypingDots = () => (
  <div
    className="flex items-center gap-1 px-1 py-0.5"
    aria-label="Typing"
    role="status"
  >
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="size-1.5 rounded-full bg-primary-foreground/70 animate-pulse"
        style={{ animationDelay: `${i * 150}ms` }}
        aria-hidden="true"
      />
    ))}
  </div>
);

const LinkPreviewCard = () => (
  <article className="w-full max-w-full overflow-hidden rounded-xl border border-border bg-background">
    <img
      src={OG_SRC}
      alt="Chess board after White played Nf3, shown from Black's perspective"
      width={800}
      height={800}
      className="aspect-square w-full object-cover"
    />
    <div className="space-y-1 border-t border-border px-3 py-2.5">
      <p className="text-sm font-medium leading-snug text-balance text-foreground">
        {SHARE_TITLE}
      </p>
      <p className="text-xs text-muted-foreground">chss.chat</p>
      <p className="truncate font-mono text-xs text-muted-foreground">
        chss.chat{EXAMPLE_PATH}
      </p>
    </div>
  </article>
);

export const LinkUnfurl = () => {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState<Step>("incoming");
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduced) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const clearTimers = () => {
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
    };

    const runCycle = () => {
      if (cancelled) return;
      clearTimers();
      setCycle((c) => c + 1);
      setStep("incoming");
      for (const { at, step: next } of TIMELINE) {
        if (at === 0) continue;
        timers.push(
          setTimeout(() => {
            if (!cancelled) setStep(next);
          }, at),
        );
      }
      timers.push(
        setTimeout(() => {
          if (!cancelled) runCycle();
        }, LOOP_MS),
      );
    };

    runCycle();

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [reduced]);

  const activeStep = reduced ? "preview" : step;
  const showTyping = activeStep === "typing";
  const showPreview = activeStep === "preview";

  return (
    <div
      className="w-full max-w-md mx-auto"
      aria-label="Example chat message showing a chess link preview"
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
          <span
            className="size-2 rounded-full bg-primary"
            aria-hidden="true"
          />
          <span className="text-sm text-muted-foreground">Messages</span>
        </div>

        {/* Fixed height + justify-end: messages grow upward, page layout stays put */}
        <MessageGroup className="h-[28rem] justify-end gap-3 overflow-hidden p-4 sm:h-[30rem]">
          <Enter key={`incoming-${cycle}`}>
            <Message align="start">
              <MessageContent>
                <Bubble variant="muted" align="start">
                  <BubbleContent>Your move</BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
          </Enter>

          {showTyping ? (
            <Enter key={`typing-${cycle}`}>
              <Message align="end">
                <MessageContent>
                  <Bubble variant="default" align="end">
                    <BubbleContent>
                      <TypingDots />
                    </BubbleContent>
                  </Bubble>
                </MessageContent>
              </Message>
            </Enter>
          ) : null}

          {showPreview ? (
            <Enter key={`preview-${cycle}`}>
              <Message align="end">
                <MessageContent className="max-w-[85%]">
                  <Bubble
                    variant="ghost"
                    align="end"
                    className="max-w-full data-[variant=ghost]:max-w-full"
                  >
                    <BubbleContent className="w-full max-w-full">
                      <LinkPreviewCard />
                    </BubbleContent>
                  </Bubble>
                </MessageContent>
              </Message>
            </Enter>
          ) : null}
        </MessageGroup>
      </div>
    </div>
  );
};

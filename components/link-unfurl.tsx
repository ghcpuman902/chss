"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { ArrowUp, ChevronLeft, ChevronRight, Plus, Video } from "lucide-react";
import { buildOgCode } from "@/lib/og-encoding";
import { cn } from "@/lib/utils";

/**
 * Deep Blue vs Kasparov, Game 2 (1997).
 * After 36…axb5 (Kasparov) → White to move.
 * After 37.Be4 (Deep Blue) → Black to move.
 */
const FEN_AFTER_AXB5 =
  "r1r1q1k1/6p1/3b1p1p/1p1PpP2/1Pp5/2P4P/R1B2QP1/R5K1 w - - 0 37";
const FEN_AFTER_BE4 =
  "r1r1q1k1/6p1/3b1p1p/1p1PpP2/1Pp1B3/2P4P/R4QP1/R5K1 b - - 1 37";

const KASPAROV_PATH = "/p/h-QaEZUFVQKg6RkNRERmRkbmZzN6AAASg";
const DEEP_BLUE_PATH = "/p/h-RaEYUFVQKg6RkUREZORkbmZzN4AAISg";

const KASPAROV_OG = `/og/${buildOgCode(FEN_AFTER_AXB5, "w")}.png`;
const DEEP_BLUE_OG = `/og/${buildOgCode(FEN_AFTER_BE4, "b")}.png`;

/** Shared width so both OG cards match. */
const CARD_WIDTH = "w-40";

const KASPAROV_TEXT = "axb5. pawn acquired. try not to overheat.";
const DEEP_BLUE_TEXT =
  "Be4. skipped the free material. spooky enough for you?";

/** Prior plies as text-only bubbles — fills history without five full boards. */
const PRIOR_MOVES: { align: "start" | "end"; text: string }[] = [
  { align: "end", text: "35. Bxd6. bishops off." },
  { align: "start", text: "…Bxd6. ok fine." },
  { align: "end", text: "36. axb5. a-file's open." },
];

type Step = "history" | "typing" | "sent";

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
      "animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out fill-mode-both",
      className,
    )}
  >
    {children}
  </div>
);

const TypingDots = () => (
  <div
    className="flex items-center gap-1"
    aria-label="Deep Blue is typing"
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

type LinkPreviewCardProps = {
  ogSrc: string;
  alt: string;
  title: string;
  /** First visible OG card is LCP on the home hero — prioritize it. */
  priority?: boolean;
};

const LinkPreviewCard = ({
  ogSrc,
  alt,
  title,
  priority = false,
}: LinkPreviewCardProps) => (
  <article className="w-full overflow-hidden rounded-[12px] border border-border bg-card shadow-sm">
    <div className="overflow-hidden bg-[#f0d9b5]">
      <Image
        src={ogSrc}
        alt={alt}
        width={640}
        height={640}
        unoptimized
        priority={priority}
        fetchPriority={priority ? "high" : "auto"}
        className="aspect-square w-full object-cover"
      />
    </div>
    <div className="space-y-0.5 border-t border-border px-2.5 py-2">
      <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">chss.chat</p>
    </div>
  </article>
);

const TextBubble = ({
  children,
  align,
}: {
  children: ReactNode;
  align: "start" | "end";
}) => (
  <div
    className={cn(
      "w-fit max-w-[16rem] px-3 py-2 text-[13px] leading-snug",
      align === "end"
        ? "self-end rounded-[16px] rounded-br-[4px] bg-primary text-primary-foreground"
        : "self-start rounded-[16px] rounded-bl-[4px] border border-border bg-card text-foreground",
    )}
  >
    {children}
  </div>
);

export const LinkUnfurl = () => {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState<Step>(reduced ? "sent" : "history");

  useEffect(() => {
    if (reduced) {
      setStep("sent");
      return () => {};
    }

    setStep("history");
    const typingTimer = window.setTimeout(() => setStep("typing"), 1400);
    const sentTimer = window.setTimeout(() => setStep("sent"), 2800);

    return () => {
      window.clearTimeout(typingTimer);
      window.clearTimeout(sentTimer);
    };
  }, [reduced]);

  const showTyping = step === "typing";
  const showSent = step === "sent";

  return (
    <div
      className="mx-auto w-full max-w-[17.5rem] sm:max-w-sm lg:max-w-md"
      aria-label="Deep Blue messages Garry Kasparov a chess link after Be4"
    >
      <div className="flex h-[28rem] flex-col overflow-hidden rounded-4xl border border-border bg-muted sm:h-[32rem] lg:h-[38rem]">
        {/* Mid-chat header (not compose / New Message) */}
        <header className="flex shrink-0 items-center gap-1.5 border-b border-border/70 bg-card/90 px-2 py-1.5 backdrop-blur-sm">
          <span
            className="flex items-center gap-0.5 text-primary"
            aria-hidden="true"
          >
            <ChevronLeft className="size-5" strokeWidth={2.25} />
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold">
              19
            </span>
          </span>

          <div className="flex min-w-0 flex-1 flex-col items-center">
            <span
              className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary"
              aria-hidden="true"
            >
              GK
            </span>
            <div className="flex items-center gap-0.5">
              <h2 className="truncate text-[12px] font-semibold tracking-tight text-foreground">
                Gary Kasparov
              </h2>
              <ChevronRight
                className="size-3 text-muted-foreground"
                strokeWidth={2.5}
                aria-hidden="true"
              />
            </div>
          </div>

          <span
            className="flex size-8 items-center justify-center text-primary"
            aria-hidden="true"
          >
            <Video className="size-5" strokeWidth={1.75} />
          </span>
        </header>

        {/* Absolute thread: message steps cannot change outer height */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className="absolute inset-0 flex flex-col justify-end gap-1.5 overflow-hidden px-3 py-2.5">
            {PRIOR_MOVES.map((move) => (
              <div
                key={move.text}
                className={cn(
                  "flex",
                  move.align === "end" ? "justify-end" : "justify-start",
                )}
              >
                <TextBubble align={move.align}>{move.text}</TextBubble>
              </div>
            ))}

            <Enter>
              <div
                className={cn("flex flex-col gap-1.5 self-start", CARD_WIDTH)}
              >
                <LinkPreviewCard
                  ogSrc={KASPAROV_OG}
                  alt={`Position after Kasparov played axb5 (chss.chat${KASPAROV_PATH}), White to move`}
                  title="White's turn"
                  priority
                />
                <TextBubble align="start">{KASPAROV_TEXT}</TextBubble>
              </div>
            </Enter>

            {showTyping ? (
              <Enter className="flex justify-end">
                <div className="rounded-[16px] rounded-br-[4px] bg-primary px-3.5 py-2.5">
                  <TypingDots />
                </div>
              </Enter>
            ) : null}

            {showSent ? (
              <Enter className="flex flex-col items-end gap-1.5">
                <div className={CARD_WIDTH}>
                  <LinkPreviewCard
                    ogSrc={DEEP_BLUE_OG}
                    alt={`Position after Deep Blue played Be4 (chss.chat${DEEP_BLUE_PATH}), Black to move`}
                    title="Black's turn"
                  />
                </div>
                <TextBubble align="end">{DEEP_BLUE_TEXT}</TextBubble>
              </Enter>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border/70 bg-card/80 px-3 py-2">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
            aria-hidden="true"
          >
            <Plus className="size-4" strokeWidth={2.5} />
          </span>
          <div className="flex min-h-9 min-w-0 flex-1 items-center rounded-full border border-border bg-background px-3.5 text-sm text-muted-foreground">
            Message
          </div>
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full transition-[transform,background-color] duration-200 ease-out",
              showSent || showTyping
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
              showSent && "scale-95",
            )}
            aria-hidden="true"
          >
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </div>
  );
};

"use server";

import { after } from "next/server";
import { getCachedOgPng } from "@/lib/og-render";

/** In-flight prewarms — concurrent calls for the same code share one render. */
const inFlight = new Map<string, Promise<void>>();

const warmCode = async (code: string): Promise<void> => {
  const existing = inFlight.get(code);
  if (existing) {
    await existing;
    return;
  }
  const work = getCachedOgPng(code)
    .then(() => undefined)
    .finally(() => {
      inFlight.delete(code);
    });
  inFlight.set(code, work);
  await work;
};

/**
 * Kick off OG PNG generation for a board code (`b-…` / legacy `o-…`).
 * Returns immediately; render continues in `after()` so Share is never blocked.
 * Pass the same code that appears in `/og/{code}.png`.
 */
export const prewarmOgImage = async (
  code: string,
): Promise<{ ok: boolean; code: string; deferred: boolean }> => {
  const trimmed = (code || "").trim();
  if (!trimmed.startsWith("b-") && !trimmed.startsWith("o-")) {
    return { ok: false, code: "", deferred: false };
  }

  // Schedule work after the response — caller (Share path) never waits on raster.
  after(async () => {
    try {
      await warmCode(trimmed);
    } catch (e) {
      console.error(
        "[prewarm]",
        trimmed.slice(0, 80),
        e instanceof Error ? e.message : String(e),
      );
    }
  });

  return { ok: true, code: trimmed, deferred: true };
};

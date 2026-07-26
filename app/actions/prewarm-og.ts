"use server";

import { getCachedOgPng } from "@/lib/og-render";

/**
 * Generate + Data-Cache the OG PNG for a board code (`b-…` / legacy `o-…`).
 * Pass the same code that appears in `/og/{code}.png` so logs match the URL.
 */
export const prewarmOgImage = async (
  code: string,
): Promise<{ ok: boolean; code: string }> => {
  try {
    const trimmed = (code || "").trim();
    if (!trimmed.startsWith("b-") && !trimmed.startsWith("o-")) {
      return { ok: false, code: "" };
    }
    await getCachedOgPng(trimmed);
    return { ok: true, code: trimmed };
  } catch {
    return { ok: false, code: "" };
  }
};

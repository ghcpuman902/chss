import { base64urlEncode } from "@/lib/base64url";
import {
  START_BOARD64,
  START_OG_CODE,
  buildOgCode,
  buildOgPath,
  fenToBoard64,
  type OgPerspective,
} from "@/lib/og-fast";

export {
  START_BOARD64,
  START_OG_CODE,
  buildOgCode,
  buildOgPath,
  fenToBoard64,
};
export type { OgPerspective };

/** @deprecated Prefer buildOgCode (b- fast format). Kept for tests of legacy o-. */
export const buildLegacyOgCode = (
  fen: string,
  perspective: OgPerspective,
): string => {
  const board64 = fenToBoard64(fen);
  return `o-${base64urlEncode(`${board64}|${perspective}`)}`;
};

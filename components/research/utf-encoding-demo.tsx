"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

type Encoding = "utf8" | "utf16";

type DecodeOk = {
  ok: true;
  text: string;
  codePoints: number[];
};

type DecodeFail = {
  ok: false;
  reason: string;
};

type DecodeResult = DecodeOk | DecodeFail;

type Preset = {
  label: string;
  char: string;
  note: string;
};

const PRESETS: Preset[] = [
  { label: "A", char: "A", note: "ASCII · 1 byte in UTF-8" },
  { label: "é", char: "é", note: "Latin · 2 bytes in UTF-8" },
  { label: "€", char: "€", note: "Currency · 3 bytes in UTF-8" },
  { label: "中", char: "中", note: "CJK · 3 bytes in UTF-8" },
  { label: "😀", char: "😀", note: "Emoji · 4 UTF-8 bytes / UTF-16 surrogate pair" },
];

const widthOf = (encoding: Encoding) => (encoding === "utf8" ? 8 : 16);

const toBits = (value: number, width: number): string => {
  let out = "";
  for (let i = width - 1; i >= 0; i -= 1) {
    out += (value >> i) & 1 ? "1" : "0";
  }
  return out;
};

const fromBits = (bits: string): number => {
  let value = 0;
  for (const ch of bits) {
    value = (value << 1) | (ch === "1" ? 1 : 0);
  }
  return value;
};

const stripToBits = (text: string) => text.replace(/[^01]/g, "");

const padBits = (bits: string, width: number) => {
  if (bits.length === 0) return "";
  const rem = bits.length % width;
  if (rem === 0) return bits;
  return bits + "0".repeat(width - rem);
};

/** Group into lines of `width`. Optionally pad the final incomplete line with 0s. */
const formatBitText = (bits: string, width: number, padFinal: boolean) => {
  const raw = stripToBits(bits);
  const padded = padFinal ? padBits(raw, width) : raw;
  if (!padded) return "";
  const lines: string[] = [];
  for (let i = 0; i < padded.length; i += width) {
    lines.push(padded.slice(i, i + width));
  }
  return lines.join("\n");
};

const bitsToUnits = (bits: string, width: number): number[] => {
  const padded = padBits(stripToBits(bits), width);
  if (!padded) return [];
  const units: number[] = [];
  for (let i = 0; i < padded.length; i += width) {
    units.push(fromBits(padded.slice(i, i + width)));
  }
  return units;
};

const encodeUtf8 = (text: string): number[] =>
  Array.from(new TextEncoder().encode(text));

const encodeUtf16 = (text: string): number[] => {
  const units: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    units.push(text.charCodeAt(i));
  }
  return units;
};

const encodeText = (text: string, encoding: Encoding): number[] =>
  encoding === "utf8" ? encodeUtf8(text) : encodeUtf16(text);

const unitsToBitText = (units: number[], width: number) =>
  units.map((unit) => toBits(unit, width)).join("\n");

const codePointsOf = (text: string): number[] => {
  const points: number[] = [];
  for (const ch of text) {
    points.push(ch.codePointAt(0) ?? 0);
  }
  return points;
};

const decodeUtf8 = (bytes: number[]): DecodeResult => {
  if (bytes.length === 0) {
    return { ok: false, reason: "No bits yet" };
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      new Uint8Array(bytes),
    );
    return { ok: true, text, codePoints: codePointsOf(text) };
  } catch {
    return { ok: false, reason: "Invalid UTF-8" };
  }
};

const decodeUtf16 = (units: number[]): DecodeResult => {
  if (units.length === 0) {
    return { ok: false, reason: "No bits yet" };
  }

  let i = 0;
  const points: number[] = [];

  while (i < units.length) {
    const unit = units[i];
    const isHigh = unit >= 0xd800 && unit <= 0xdbff;
    const isLow = unit >= 0xdc00 && unit <= 0xdfff;

    if (isHigh) {
      if (i + 1 >= units.length) {
        return { ok: false, reason: "Lone high surrogate" };
      }
      const low = units[i + 1];
      if (low < 0xdc00 || low > 0xdfff) {
        return { ok: false, reason: "Broken surrogate pair" };
      }
      points.push(0x10000 + ((unit - 0xd800) << 10) + (low - 0xdc00));
      i += 2;
      continue;
    }

    if (isLow) {
      return { ok: false, reason: "Lone low surrogate" };
    }

    points.push(unit);
    i += 1;
  }

  return {
    ok: true,
    text: String.fromCodePoint(...points),
    codePoints: points,
  };
};

const decodeUnits = (units: number[], encoding: Encoding): DecodeResult =>
  encoding === "utf8" ? decodeUtf8(units) : decodeUtf16(units);

const formatCodePoints = (points: number[]): string =>
  points.map((p) => `U+${p.toString(16).toUpperCase().padStart(4, "0")}`).join(" ");

const unitHex = (value: number, width: number) =>
  `0x${value.toString(16).toUpperCase().padStart(width === 8 ? 2 : 4, "0")}`;

export const UtfEncodingDemo = () => {
  const charsId = useId();
  const bitsId = useId();
  const [encoding, setEncoding] = useState<Encoding>("utf8");
  const [chars, setChars] = useState("中");
  const [bitText, setBitText] = useState(() =>
    unitsToBitText(encodeUtf8("中"), 8),
  );

  const width = widthOf(encoding);
  const units = bitsToUnits(bitText, width);
  const decoded = decodeUnits(units, encoding);
  const bitCount = stripToBits(bitText).length;
  const lineCount = units.length;

  const syncFromChars = (text: string, nextEncoding: Encoding = encoding) => {
    const nextWidth = widthOf(nextEncoding);
    setChars(text);
    setBitText(unitsToBitText(encodeText(text, nextEncoding), nextWidth));
  };

  const applyBits = (
    raw: string,
    nextEncoding: Encoding,
    padFinal: boolean,
    syncChars: boolean,
  ) => {
    const nextWidth = widthOf(nextEncoding);
    const formatted = formatBitText(raw, nextWidth, padFinal);
    setBitText(formatted);

    if (!syncChars) return;

    const bitCountNow = stripToBits(formatted).length;
    // While typing, only map back once groups are complete (or after blur pads them).
    if (!padFinal && bitCountNow % nextWidth !== 0) return;

    const result = decodeUnits(bitsToUnits(formatted, nextWidth), nextEncoding);
    if (result.ok) {
      setChars(result.text);
    }
  };

  const handleEncodingChange = (next: Encoding) => {
    if (next === encoding) return;
    setEncoding(next);
    // Re-encode the current characters in the new encoding (not raw-bit regroup).
    const text = decoded.ok ? decoded.text : chars;
    syncFromChars(text, next);
  };

  const handleCharsChange = (value: string) => {
    syncFromChars(value);
  };

  const handleBitsChange = (value: string) => {
    // Regroup while typing; leave the last line short until blur.
    applyBits(value, encoding, false, true);
  };

  const handleBitsBlur = () => {
    applyBits(bitText, encoding, true, true);
  };

  const handlePreset = (char: string) => {
    syncFromChars(char);
  };

  return (
    <figure className="my-6 border border-border rounded-sm overflow-hidden">
      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-col gap-1 min-h-6">
            <label
              htmlFor={charsId}
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Displayed glyphs
            </label>
            {decoded.ok ? (
              <span className="font-mono text-xs text-muted-foreground truncate">
                Code points · {formatCodePoints(decoded.codePoints)}
              </span>
            ) : bitCount > 0 ? (
              <span className="text-xs text-amber-800 dark:text-amber-200 truncate">
                {decoded.reason}
              </span>
            ) : null}
          </div>

          <textarea
            id={charsId}
            value={chars}
            onChange={(event) => handleCharsChange(event.target.value)}
            spellCheck={false}
            rows={4}
            aria-label="Characters to encode"
            className="w-full min-h-[7.5rem] resize-y border border-border bg-background px-3 py-2 font-mono text-2xl leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Preset characters"
          >
            {PRESETS.map((preset) => {
              const active = chars === preset.char;
              return (
                <button
                  key={preset.char}
                  type="button"
                  title={preset.note}
                  onClick={() => handlePreset(preset.char)}
                  aria-pressed={active}
                  aria-label={preset.note}
                  className={cn(
                    "size-9 border border-border text-base transition-colors duration-150 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-foreground text-background"
                      : "bg-background hover:bg-muted/50",
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-col gap-1.5 min-h-6 sm:flex-row sm:items-center sm:justify-between">
            <label
              htmlFor={bitsId}
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Encoded bits
            </label>
            <div
              className="inline-flex border border-border rounded-sm overflow-hidden self-start"
              role="group"
              aria-label="Bit group width"
            >
              {(["utf8", "utf16"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleEncodingChange(mode)}
                  aria-pressed={encoding === mode}
                  title={
                    mode === "utf8"
                      ? "Encode as UTF-8 (8-bit bytes)"
                      : "Encode as UTF-16 (16-bit code units)"
                  }
                  className={cn(
                    "px-2.5 py-1 text-xs transition-colors duration-150 ease-out",
                    encoding === mode
                      ? "bg-foreground text-background"
                      : "bg-background text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {mode === "utf8" ? "UTF-8" : "UTF-16"}
                </button>
              ))}
            </div>
          </div>

          <textarea
            id={bitsId}
            value={bitText}
            onChange={(event) => handleBitsChange(event.target.value)}
            onBlur={handleBitsBlur}
            spellCheck={false}
            rows={4}
            inputMode="numeric"
            aria-label={`Bit pattern grouped by ${width}`}
            aria-describedby={`${bitsId}-meta`}
            className="w-full min-h-[7.5rem] resize-y border border-border bg-background px-3 py-2 font-mono text-sm leading-relaxed tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          <div
            id={`${bitsId}-meta`}
            className="flex flex-col gap-1 text-xs text-muted-foreground"
          >
            <span className="tabular-nums">
              {bitCount} bits
              <span className="mx-1.5 text-border" aria-hidden="true">
                ·
              </span>
              {lineCount}{" "}
              {encoding === "utf8"
                ? lineCount === 1
                  ? "UTF-8 byte"
                  : "UTF-8 bytes"
                : lineCount === 1
                  ? "UTF-16 code unit"
                  : "UTF-16 code units"}
            </span>
            {units.length > 0 ? (
              <span
                className="font-mono tabular-nums break-all"
                title="Hex per unit"
              >
                {units.map((u) => unitHex(u, width)).join(" · ")}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <figcaption className="border-t border-border px-4 sm:px-5 py-3 text-sm text-muted-foreground leading-relaxed">
        {decoded.ok && chars.length > 0 ? (
          <>
            Serialised URL characters for this input in a path context:{" "}
            <code className="text-xs text-foreground break-all">
              {encodeURIComponent(chars)}
            </code>
            . Browsers may still display the glyph; the serialised form is what
            travels in the URL.
          </>
        ) : (
          <>
            Pick a glyph to compare displayed characters, code points, UTF-8
            bytes, UTF-16 units, and serialised URL characters.
          </>
        )}
      </figcaption>
    </figure>
  );
};

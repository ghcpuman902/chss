"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

type Encoding = "utf8" | "utf16" | "ascii";

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

const widthOf = (encoding: Encoding) => {
  if (encoding === "utf8") return 8;
  if (encoding === "ascii") return 7;
  return 16;
};

const isAsciiText = (text: string) => {
  for (const ch of text) {
    if ((ch.codePointAt(0) ?? 0) > 0x7f) return false;
  }
  return true;
};

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

const encodeAscii = (text: string): number[] => {
  const units: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp > 0x7f) {
      throw new Error("Not ASCII");
    }
    units.push(cp);
  }
  return units;
};

const encodeText = (text: string, encoding: Encoding): number[] => {
  if (encoding === "utf8") return encodeUtf8(text);
  if (encoding === "ascii") return encodeAscii(text);
  return encodeUtf16(text);
};

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

const decodeAscii = (units: number[]): DecodeResult => {
  if (units.length === 0) {
    return { ok: false, reason: "No bits yet" };
  }

  for (const unit of units) {
    if (unit > 0x7f) {
      return { ok: false, reason: "Not ASCII (value > 127)" };
    }
  }

  return {
    ok: true,
    text: String.fromCodePoint(...units),
    codePoints: [...units],
  };
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

const decodeUnits = (units: number[], encoding: Encoding): DecodeResult => {
  if (encoding === "utf8") return decodeUtf8(units);
  if (encoding === "ascii") return decodeAscii(units);
  return decodeUtf16(units);
};

const formatCodePoints = (points: number[]): string =>
  points.map((p) => `U+${p.toString(16).toUpperCase().padStart(4, "0")}`).join(" ");

const unitHex = (value: number, width: number) =>
  `0x${value.toString(16).toUpperCase().padStart(width === 16 ? 4 : 2, "0")}`;

const ENCODING_OPTIONS: {
  value: Encoding;
  label: string;
  title: string;
}[] = [
  { value: "ascii", label: "ASCII", title: "Encode as 7-bit ASCII (U+007F max)" },
  { value: "utf8", label: "UTF-8", title: "Encode as UTF-8 (8-bit bytes)" },
  { value: "utf16", label: "UTF-16", title: "Encode as UTF-16 (16-bit code units)" },
];

const unitLabel = (encoding: Encoding, count: number) => {
  if (encoding === "ascii") {
    return count === 1 ? "ASCII character" : "ASCII characters";
  }
  if (encoding === "utf8") {
    return count === 1 ? "UTF-8 byte" : "UTF-8 bytes";
  }
  return count === 1 ? "UTF-16 code unit" : "UTF-16 code units";
};

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

    if (nextEncoding === "ascii" && text.length > 0 && !isAsciiText(text)) {
      setBitText("");
      return;
    }

    try {
      setBitText(unitsToBitText(encodeText(text, nextEncoding), nextWidth));
    } catch {
      setBitText("");
    }
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

  const asciiRejected =
    encoding === "ascii" && chars.length > 0 && !isAsciiText(chars);

  const statusMessage = asciiRejected
    ? "Not ASCII (U+007F max)"
    : decoded.ok
      ? null
      : bitCount > 0
        ? decoded.reason
        : null;

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
            {decoded.ok && !asciiRejected ? (
              <span className="font-mono text-xs text-muted-foreground truncate">
                Code points · {formatCodePoints(decoded.codePoints)}
              </span>
            ) : statusMessage ? (
              <span className="text-xs text-amber-800 dark:text-amber-200 truncate">
                {statusMessage}
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
              {ENCODING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleEncodingChange(option.value)}
                  aria-pressed={encoding === option.value}
                  title={option.title}
                  className={cn(
                    "px-2.5 py-1 text-xs transition-colors duration-150 ease-out",
                    encoding === option.value
                      ? "bg-foreground text-background"
                      : "bg-background text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {option.label}
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
              {lineCount} {unitLabel(encoding, lineCount)}
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
        {decoded.ok && chars.length > 0 && !asciiRejected ? (
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
            Pick a glyph to compare displayed characters, code points, ASCII
            (7-bit), UTF-8 bytes, UTF-16 units, and serialised URL characters.
          </>
        )}
      </figcaption>
    </figure>
  );
};

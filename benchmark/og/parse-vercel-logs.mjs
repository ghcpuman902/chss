#!/usr/bin/env node
/**
 * YOU RUN after deploy: parse `vercel logs --json` for /og cacheReason + duration.
 *
 * Usage:
 *   vercel logs chss.chat --since 10m --json > /tmp/og.jsonl
 *   node benchmark/og/parse-vercel-logs.mjs /tmp/og.jsonl --tag it01-03
 */

import fs from "node:fs";
import { writeResult } from "./_schema.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const tagIdx = args.indexOf("--tag");
const tag = tagIdx >= 0 && args[tagIdx + 1] ? args[tagIdx + 1] : "logs";

if (!file) {
  console.error(
    "Usage: node benchmark/og/parse-vercel-logs.mjs <jsonl> --tag <tag>",
  );
  process.exit(1);
}

const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
const rows = [];

for (const line of lines) {
  // CLI may interleave non-JSON; keep only JSON objects.
  const start = line.indexOf("{");
  if (start < 0) continue;
  let obj;
  try {
    obj = JSON.parse(line.slice(start));
  } catch {
    continue;
  }

  const path =
    obj.path ??
    obj.requestPath ??
    obj.url ??
    obj.proxy?.path ??
    obj.message?.path ??
    "";
  const pathStr = String(path);
  if (!pathStr.includes("/og/")) continue;

  const cacheReason =
    obj.cacheReason ??
    obj.proxy?.cacheReason ??
    obj.message?.cacheReason ??
    null;
  const cache =
    obj.cache ??
    obj.proxy?.cacheId ??
    obj.xVercelCache ??
    obj.message?.cache ??
    null;
  const duration =
    obj.duration ??
    obj.proxy?.duration ??
    obj.message?.duration ??
    obj.ms ??
    null;
  const region =
    obj.region ?? obj.proxy?.region ?? obj.message?.region ?? null;
  const ua =
    obj.userAgent ??
    obj.requestUserAgent ??
    obj.proxy?.userAgent ??
    obj.message?.userAgent ??
    null;

  rows.push({
    path: pathStr,
    cache,
    cacheReason,
    duration_ms: duration,
    region,
    ua,
    status: obj.statusCode ?? obj.status ?? obj.proxy?.statusCode ?? null,
    raw_keys: Object.keys(obj).slice(0, 20),
  });
}

const byReason = {};
for (const r of rows) {
  const key = r.cacheReason ?? r.cache ?? "unknown";
  byReason[key] = (byReason[key] ?? 0) + 1;
}

const summary = {
  n: rows.length,
  by_cache_reason: byReason,
  sample: rows.slice(0, 20),
};

console.log(JSON.stringify(summary, null, 2));

const { file: outFile } = writeResult({
  iteration: `vercel_logs_${tag}`,
  engine: "production",
  prod: rows,
  extra: { by_cache_reason: byReason },
  meta: { source_log: file, tag },
});
console.error(`wrote ${outFile} (${rows.length} /og rows)`);

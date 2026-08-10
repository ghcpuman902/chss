#!/usr/bin/env node
/**
 * YOU RUN after deploy: curl matrix → TTFB + x-vercel-cache
 *
 * Usage:
 *   node benchmark/og/prod-probe.mjs --tag it01-03 [--origin https://chss.chat]
 */

import {
  loadFixtures,
  writeResult,
} from "./_schema.mjs";

const args = process.argv.slice(2);
const tagIdx = args.indexOf("--tag");
const tag = tagIdx >= 0 && args[tagIdx + 1] ? args[tagIdx + 1] : "prod";
const originIdx = args.indexOf("--origin");
const origin =
  originIdx >= 0 && args[originIdx + 1]
    ? args[originIdx + 1]
    : "https://chss.chat";

const UAS = [
  { name: "Twitterbot", ua: "Twitterbot/1.0" },
  {
    name: "facebookexternalhit",
    ua: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  },
  { name: "WhatsApp", ua: "WhatsApp/2.0" },
  { name: "curl", ua: "chss-og-probe/1.0" },
];

/** Probe a representative slice: all ply1, top 5 ply2, all midgame, start. */
const selectPositions = (fixtures) => {
  const out = [];
  for (const p of fixtures.positions) {
    if (p.category === "start") out.push(p);
    if (p.category === "ply1") out.push(p);
    if (p.category === "ply2" && out.filter((x) => x.category === "ply2").length < 5)
      out.push(p);
    if (p.category === "midgame") out.push(p);
  }
  return out;
};

const probeOnce = async (url, ua) => {
  const t0 = performance.now();
  const res = await fetch(url, {
    headers: { "User-Agent": ua },
    redirect: "follow",
  });
  // Drain body so connection timing is complete.
  const buf = await res.arrayBuffer();
  const ttfb_ms = Number((performance.now() - t0).toFixed(1));
  return {
    status: res.status,
    ttfb_ms,
    bytes: buf.byteLength,
    cache: res.headers.get("x-vercel-cache") ?? res.headers.get("cf-cache-status") ?? "",
    age: res.headers.get("age") ?? "",
    cacheControl: res.headers.get("cache-control") ?? "",
  };
};

const fixtures = loadFixtures();
const positions = selectPositions(fixtures);
const prod = [];

for (const pos of positions) {
  const url = `${origin}/og/${pos.ogCode}.png`;
  for (const { name, ua } of UAS) {
    try {
      const r = await probeOnce(url, ua);
      prod.push({
        ogCode: pos.ogCode,
        id: pos.id,
        category: pos.category,
        ply: pos.ply,
        ua: name,
        ...r,
        cacheReason: null,
        region: null,
      });
      console.log(
        `${pos.id.padEnd(24)} ${name.padEnd(20)} ${String(r.ttfb_ms).padStart(7)}ms  cache=${r.cache || "?"}  status=${r.status}`,
      );
    } catch (e) {
      prod.push({
        ogCode: pos.ogCode,
        id: pos.id,
        category: pos.category,
        ply: pos.ply,
        ua: name,
        status: 0,
        ttfb_ms: null,
        error: e instanceof Error ? e.message : String(e),
        cacheReason: null,
        region: null,
      });
      console.error(`FAIL ${pos.id} ${name}:`, e);
    }
  }
}

const { file } = writeResult({
  iteration: `prod_${tag}`,
  engine: "production",
  prod,
  meta: { origin, tag },
});
console.error(`wrote ${file}`);

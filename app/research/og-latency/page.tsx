import type { Metadata } from "next";
import Link from "next/link";
import results from "@/lib/og-latency-results.json";

export const metadata: Metadata = {
  title: "How slow can one chess preview image be?",
  description:
    "You make a move and send a link. The chat app fetches an Open Graph image. Why the first share is a cold render, and what we measured while making it fast without blocking Share.",
  alternates: {
    canonical: "/research/og-latency",
  },
};

const fmtMs = (n: number) => `${n.toFixed(1)} ms`;

export default function OgLatencyResearchPage() {
  const { baseline, local_final, iterations } = results;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-foreground">
      <p className="text-sm text-muted-foreground">
        <Link href="/research/compression" className="underline-offset-4 hover:underline">
          Compression research
        </Link>
        {" · "}
        <Link href="/" className="underline-offset-4 hover:underline">
          chss.chat
        </Link>
      </p>

      <h1 className="mt-6 font-serif text-4xl leading-tight tracking-tight">
        How slow can one chess preview image be?
      </h1>

      <p className="mt-6 text-lg leading-relaxed">
        You make a move and send the board to a friend. The link has to show a
        picture in iMessage or WhatsApp. That picture is not the page — it is a
        separate PNG the crawler fetches from{" "}
        <code className="text-sm">/og/b-….png</code>. How long can that take?
      </p>

      <p className="mt-4 leading-relaxed">
        The obvious answer is “render a board.” That gets us surprisingly far.
        Except every unique position is a unique URL, so the first share of a
        position is almost always a cold miss. Share itself must stay instant —
        we never wait on the image before opening the system sheet.
      </p>

      <h2 className="mt-12 font-serif text-2xl tracking-tight">
        Two different clocks
      </h2>
      <p className="mt-4 leading-relaxed">
        Origin render cost is how long it takes to produce the PNG when nothing
        is cached. That number is measurable on a laptop. Crawler TTFB is what
        the chat app actually waits for — CDN, cold start, and{" "}
        <code className="text-sm">cacheReason</code> — and that only shows up in
        production logs.
      </p>

      <h2 className="mt-12 font-serif text-2xl tracking-tight">
        The first move was never prerendered
      </h2>
      <p className="mt-4 leading-relaxed">
        Our lookup book only stored even plies. After{" "}
        <code className="text-sm">e2e4</code>, it is Black to move — an odd ply.
        Baseline coverage of every legal first move was{" "}
        <strong>{baseline.ply_1_pct}%</strong>. The second ply was already{" "}
        {baseline.ply_2_pct}%. The gap was structural, not frequency.
      </p>
      <p className="mt-4 leading-relaxed">
        Prediction before the fix: ply-1 coverage goes to 100%. After snapshotting
        intermediate plies along popular lines and adding all twenty legal first
        moves, the table grew from {baseline.total_codes} to{" "}
        {local_final.total_codes} codes and ply-1 hit{" "}
        <strong>{local_final.ply_1_pct}%</strong>.
      </p>

      <h2 className="mt-12 font-serif text-2xl tracking-tight">
        Before you look at the chart
      </h2>
      <p className="mt-4 leading-relaxed">
        Local Satori (next/og) sat around {fmtMs(baseline.render_p50_ms)} p50.
        Production still felt like a second because cold Lambdas and CDN fill
        dominate. If we only swap the rasteriser, how much of the origin cost
        should disappear — 2×? 4×?
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-4 font-medium">Stage</th>
              <th className="py-2 pr-4 font-medium">Engine</th>
              <th className="py-2 pr-4 font-medium">p50</th>
              <th className="py-2 pr-4 font-medium">p95</th>
              <th className="py-2 font-medium">PNG p50</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/60">
              <td className="py-2 pr-4">Baseline</td>
              <td className="py-2 pr-4">{baseline.engine}</td>
              <td className="py-2 pr-4">{fmtMs(baseline.render_p50_ms)}</td>
              <td className="py-2 pr-4">{fmtMs(baseline.render_p95_ms)}</td>
              <td className="py-2">{baseline.bytes_p50.toLocaleString()} B</td>
            </tr>
            <tr>
              <td className="py-2 pr-4">After IT-02+03</td>
              <td className="py-2 pr-4">{local_final.engine}</td>
              <td className="py-2 pr-4">{fmtMs(local_final.render_p50_ms)}</td>
              <td className="py-2 pr-4">{fmtMs(local_final.render_p95_ms)}</td>
              <td className="py-2">{local_final.bytes_p50.toLocaleString()} B</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4 leading-relaxed">
        Takumi cut origin p50 by about {local_final.speedup_vs_baseline.toFixed(0)}×
        and the PNGs got smaller. Flattening the template (one board background
        plus positioned pieces) added another ~11%. The prediction of “bytes
        within ±10%” was wrong — they shrank ~37%, which is fine.
      </p>

      <h2 className="mt-12 font-serif text-2xl tracking-tight">
        Could the phone do the work?
      </h2>
      <p className="mt-4 leading-relaxed">
        Takumi ships a WASM build. On the same machine, WASM render p50 was ~9&nbsp;ms
        after a 17&nbsp;ms init — competitive with native. The binary is 3.7&nbsp;MB.
        Paying that over the network so the origin can skip a 7&nbsp;ms render is the
        wrong trade. We measured it, wrote it down, and left origin rendering
        where it is.
      </p>

      <h2 className="mt-12 font-serif text-2xl tracking-tight">
        What we tried, in order
      </h2>
      <ol className="mt-4 list-decimal space-y-3 pl-5 leading-relaxed">
        {iterations.map((it) => (
          <li key={it.id}>
            <span className="font-medium">{it.label}</span>
            <span className="text-muted-foreground"> — predicted: {it.prediction}</span>
            <br />
            Result: {it.result}. Verdict: {it.verdict}.
          </li>
        ))}
      </ol>

      <h2 className="mt-12 font-serif text-2xl tracking-tight">
        What production showed
      </h2>
      <p className="mt-4 leading-relaxed">
        After deploy we probed the same fixtures with crawler user-agents. The
        latency goal held: Twitterbot ply-1 landed around{" "}
        {results.production.summary.ply1_twitterbot_p50_ms}&nbsp;ms (was ~1.1&nbsp;s),
        and cold midgame misses sat near{" "}
        {results.production.summary.midgame_cold_miss_twitterbot_ms}&nbsp;ms. WhatsApp
        and curl then hit the CDN in ~{results.production.summary.ply1_whatsapp_p50_ms}
        &nbsp;ms.
      </p>
      <p className="mt-4 leading-relaxed">
        The PRERENDER prediction was wrong for the interesting clients.
        Twitterbot and Facebook get <code className="text-sm">BYPASS</code> with{" "}
        <code className="text-sm">cacheReason=crawler</code> — they do not keep a
        CDN HIT the way WhatsApp does. Concurrent probes also collapse into
        BYPASS. So the win is mostly a faster origin (Takumi), not a free static
        edge hit for every crawler.
      </p>

      <pre className="mt-4 overflow-x-auto rounded-md bg-muted/40 p-4 text-xs leading-relaxed">
        {results.production.commands.join("\n")}
      </pre>

      <p className="mt-8 text-sm text-muted-foreground leading-relaxed">
        Reproduce locally from{" "}
        <code className="text-xs">benchmark/og/README.md</code>. Ledger:{" "}
        <code className="text-xs">benchmark/og/LEDGER.md</code>. Constraint
        throughout: Share is never gated on prewarm.
      </p>
    </main>
  );
}

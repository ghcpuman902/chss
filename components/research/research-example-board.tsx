import { buildOgPath, type OgPerspective } from "@/lib/og-encoding";

/** Static mini board for research examples — one cached OG PNG, not a DOM grid. */
export const ResearchExampleBoard = ({
  fen,
  label,
  perspective,
}: {
  fen: string;
  label: string;
  /** Defaults to side-to-move / opponent view when omitted. */
  perspective?: OgPerspective;
}) => {
  const stm = (fen.split(" ")[1] === "b" ? "b" : "w") as OgPerspective;
  const view = perspective ?? stm;
  const src = buildOgPath(fen, view);

  return (
    <img
      src={src}
      alt={label}
      width={128}
      height={128}
      className="block w-28 sm:w-32 aspect-square shrink-0 border border-border rounded-none bg-muted/30"
      loading="lazy"
      decoding="async"
    />
  );
};

import { ImageResponse } from "next/og";

/** A vinyl record: black disc, faint grooves, amber label. Drawn for any square size. */
export function recordIcon(size: number, { padded = false }: { padded?: boolean } = {}) {
  // Maskable/Apple icons get cropped to a circle or rounded square, so leave a margin.
  const disc = Math.round(size * (padded ? 0.78 : 0.94));
  const ring = (f: number) => Math.round(disc * f);
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#09090b" }}>
        <div
          style={{
            width: disc,
            height: disc,
            borderRadius: "50%",
            background: "#18181b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: ring(0.78),
              height: ring(0.78),
              borderRadius: "50%",
              border: `${Math.max(1, Math.round(disc * 0.012))}px solid #3f3f46`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: ring(0.4),
                height: ring(0.4),
                borderRadius: "50%",
                background: "#fbbf24",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ width: ring(0.07), height: ring(0.07), borderRadius: "50%", background: "#09090b" }} />
            </div>
          </div>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}

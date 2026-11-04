import { recordIcon } from "@/lib/appIcon";

export const contentType = "image/png";

// Served at /icon/32, /icon/192 and /icon/512 (favicon + Android home-screen icons).
export function generateImageMetadata() {
  return [32, 192, 512].map((n) => ({ id: String(n), size: { width: n, height: n }, contentType }));
}

export default async function Icon({ id }: { id: Promise<string> | string }) {
  return recordIcon(Number(await id));
}

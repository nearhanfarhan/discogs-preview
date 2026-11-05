import { Suspense } from "react";
import { SellerView } from "./SellerView";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `${decodeURIComponent(username)} · Discogs Preview` };
}

export default async function SellerPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return (
    <Suspense>
      <SellerView username={decodeURIComponent(username)} />
    </Suspense>
  );
}

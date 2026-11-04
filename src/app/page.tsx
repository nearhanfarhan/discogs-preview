import { SellerInput } from "@/components/SellerInput";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center px-4 pt-24 pb-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-50 sm:text-5xl">Listen to a record shop.</h1>
      <p className="mt-4 text-lg text-zinc-400">
        Paste a Discogs seller link, filter by genre, price, year and condition, then press play. Their stock plays
        back as a playlist, with the price of each record on screen.
      </p>
      <div className="mt-10 w-full">
        <SellerInput />
      </div>
      <ul className="mt-12 grid w-full gap-4 text-left text-sm text-zinc-400 sm:grid-cols-3">
        <li className="rounded-xl border border-zinc-800 p-4">
          <strong className="block text-zinc-200">Filter the crates</strong>
          Price, year, format and condition apply at once. Genres and styles fill in as records load.
        </li>
        <li className="rounded-xl border border-zinc-800 p-4">
          <strong className="block text-zinc-200">Hands-free listening</strong>
          One track per record, or every track, and it carries on in a background tab.
        </li>
        <li className="rounded-xl border border-zinc-800 p-4">
          <strong className="block text-zinc-200">Act on what you hear</strong>
          Connect Discogs to add records to your wantlist, or go straight to the listing to buy.
        </li>
      </ul>
    </main>
  );
}

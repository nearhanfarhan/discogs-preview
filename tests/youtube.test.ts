import { describe, expect, it } from "vitest";
import { youtubeId } from "@/lib/discogs/youtube";

describe("youtubeId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["http://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("%s", (url, id) => expect(youtubeId(url)).toBe(id));

  it.each(["https://vimeo.com/123", "https://www.youtube.com/watch?v=short", "nope"])("rejects %s", (url) =>
    expect(youtubeId(url)).toBeNull(),
  );
});

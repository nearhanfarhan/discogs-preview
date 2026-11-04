/** Raw shapes returned by the Discogs API (only the fields we use). */

export interface DiscogsPrice {
  value: number;
  currency: string;
}

export interface DiscogsListing {
  id: number;
  status: string;
  uri: string;
  condition: string;
  sleeve_condition?: string;
  comments?: string;
  ships_from?: string;
  posted?: string;
  price: DiscogsPrice;
  shipping_price?: DiscogsPrice;
  release: {
    id: number;
    description: string;
    artist: string;
    title: string;
    format: string;
    year: number;
    thumbnail?: string;
    catalog_number?: string;
  };
}

export interface DiscogsPagination {
  page: number;
  pages: number;
  per_page: number;
  items: number;
}

export interface DiscogsInventoryResponse {
  pagination: DiscogsPagination;
  listings: DiscogsListing[];
}

export interface DiscogsRelease {
  id: number;
  title: string;
  year?: number;
  uri: string;
  thumb?: string;
  artists?: { name: string }[];
  genres?: string[];
  styles?: string[];
  videos?: { uri: string; title: string; duration: number; embed: boolean }[];
  images?: { type: string; uri: string; uri150: string }[];
}

export interface DiscogsWantsResponse {
  pagination: DiscogsPagination;
  wants: { id: number }[];
}

/** Slimmed shapes our API returns to the browser. */

export interface Listing {
  id: number;
  url: string;
  releaseId: number;
  artist: string;
  title: string;
  format: string;
  year: number;
  thumb: string | null;
  condition: string;
  sleeveCondition: string | null;
  price: DiscogsPrice;
  shipping: DiscogsPrice | null;
  shipsFrom: string | null;
  comments: string | null;
}

export interface Video {
  videoId: string;
  title: string;
  duration: number;
}

export interface Release {
  id: number;
  title: string;
  artist: string;
  year: number | null;
  url: string;
  image: string | null;
  genres: string[];
  styles: string[];
  videos: Video[];
}

export interface InventoryPage {
  page: number;
  pages: number;
  items: number;
  listings: Listing[];
}

export type InventorySort = "listed" | "price" | "artist" | "item";
export type SortOrder = "asc" | "desc";

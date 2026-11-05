"use client";

import { useEffect, useState } from "react";
import { loginHref, useAccount } from "@/store/account";

export function AccountMenu() {
  const { username, loaded, error, load, clearError } = useAccount();
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    load();
    const url = new URL(window.location.href);
    const msg = url.searchParams.get("auth_error");
    if (msg) {
      setAuthError(msg);
      url.searchParams.delete("auth_error");
      window.history.replaceState(null, "", url);
    }
  }, [load]);

  const banner = authError ?? error;

  return (
    <div className="flex items-center gap-3 text-sm">
      {banner && (
        <button
          type="button"
          onClick={() => {
            setAuthError(null);
            clearError();
          }}
          className="rounded bg-rose-500/15 px-2 py-1 text-xs text-rose-200"
          title="Dismiss"
        >
          {banner} ✕
        </button>
      )}
      {!loaded ? null : username ? (
        <>
          <a
            href={`https://www.discogs.com/wantlist?user=${encodeURIComponent(username)}`}
            target="_blank"
            rel="noreferrer"
            className="text-zinc-300 hover:text-white"
          >
            @{username}
          </a>
          <form
            method="post"
            action="/api/auth/discogs/logout"
            onSubmit={(e) => {
              e.currentTarget.action = `/api/auth/discogs/logout?returnTo=${encodeURIComponent(
                window.location.pathname + window.location.search,
              )}`;
            }}
          >
            <button className="text-zinc-500 hover:text-zinc-300">Sign out</button>
          </form>
        </>
      ) : (
        <a
          href={loginHref()}
          onClick={(e) => (e.currentTarget.href = loginHref())}
          className="rounded-md bg-zinc-100 px-3 py-1.5 font-medium text-zinc-900 hover:bg-white"
        >
          Connect Discogs
        </a>
      )}
    </div>
  );
}

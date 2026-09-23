"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useVaultSession } from "./AuthGate";

const items = [
  { href: "/", label: "Home" },
  { href: "/overview", label: "Overview" },
  { href: "/vault", label: "Vault" },
  { href: "/chat", label: "Chat" },
  { href: "/inbox", label: "Inbox" },
  { href: "/settings/profile", label: "Settings" }
] as const;
export function AppNav({ pendingSuggestions }: { pendingSuggestions: number }) {
  const pathname = usePathname();
  const { logout } = useVaultSession();

  return (
    <header className="signals-shell-header">
      <Link className="signals-wordmark" href="/" aria-label="Funes home">
        funes<span>.</span>
      </Link>
      <nav className="signals-nav" aria-label="Application navigation">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href.split("/").slice(0, 2).join("/"));

          return (
            <Link
              key={item.href}
              href={item.href}
              data-active={active ? "true" : undefined}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
              {item.href === "/inbox" && pendingSuggestions > 0 ? (
                <sup>
                  <span className="visually-hidden">Pending suggestions: </span>
                  {pendingSuggestions}
                </sup>
              ) : null}
            </Link>
          );
        })}
        <button
          type="button"
          className="signals-signout"
          onClick={() => void logout()}
        >
          Sign out
        </button>
      </nav>
    </header>
  );
}

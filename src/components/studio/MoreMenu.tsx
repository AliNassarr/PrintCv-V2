"use client";

import React, { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LOGIN_URL } from "@/lib/auth-urls";
import { getSessionController } from "@/lib/draft-session";

const ITEM = "flex h-11 w-full items-center px-3 text-left text-app hover:bg-active";
const LOGOUT_TITLE = "Log out. Your CV stays in this browser.";

type MenuItem = { label: string; title?: string } & ({ href: string } | { onSelect: () => void });

// A button that opens a small menu. Enter, Space or Arrow down open it on the first item; the arrows, Home and End
// move; Escape closes it and gives focus back to the button; a click outside closes it.
// `button` is the trigger element (it gets the ref and the menu attributes). `heading` is a plain first line
// above the items, not part of the menu. The items exist only while the menu is open. No item has a data-test-id.
function Menu({ label, button, heading, items }: { label: string; button: ReactElement; heading?: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const menuItems = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  // Focus the first item on open; a click outside closes the menu
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const list = menuItems();
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const to =
        e.key === "Home" ? 0
        : e.key === "End" ? list.length - 1
        : (at + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      list[to]?.focus();
    }
  };

  // Close first and give focus back to the button, so a dialog opened from here returns focus to it
  const pick = (action: () => void) => () => {
    close(true);
    action();
  };

  const trigger = cloneElement(button, {
    ref: buttonRef,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: () => setOpen((v) => !v),
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== "ArrowDown") return;
      e.preventDefault();
      setOpen(true);
    },
  });

  return (
    <div ref={wrapRef} className="relative">
      {trigger}
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-48 rounded-card border border-edge bg-paper py-1 shadow-overlay">
          {heading && <p className="mb-1 truncate border-b border-edge px-3 pb-2 pt-1 text-app font-medium">{heading}</p>}
          <ul id={menuId} ref={listRef} role="menu" aria-label={label} onKeyDown={onKeyDown}>
            {items.map((item) => (
              <li key={item.label} role="none">
                {"href" in item ? (
                  <a role="menuitem" tabIndex={-1} href={item.href} title={item.title} className={ITEM}
                    onClick={async () => {
                      try { await getSessionController().flush(); } catch {}
                    }}
                  >{item.label}</a>
                ) : (
                  <button type="button" role="menuitem" tabIndex={-1} onClick={pick(item.onSelect)} title={item.title} className={ITEM}>
                    {item.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// "More" in the top bar below 1024px: Order, Update from 42, then Log in or Log out.
export function MoreMenu({ loggedIn, onOrder, onLogout }: { loggedIn: boolean; onOrder: () => void; onLogout: () => void }) {
  const items: MenuItem[] = [{ label: "Order", onSelect: onOrder }];
  if (loggedIn) items.push({ label: "Update from 42", href: LOGIN_URL }, { label: "Log out", title: LOGOUT_TITLE, onSelect: onLogout });
  else items.push({ label: "Log in with 42", href: LOGIN_URL });
  return (
    <Menu label="More" items={items}
      button={
        <Button size="sm" variant="ghost">
          More
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </Button>
      } />
  );
}

// The account circle in the top bar from 1024px: the login as the first line, then Update from 42 and Log out
export function AccountMenu({ login, initials, onLogout }: { login: string; initials: string; onLogout: () => void }) {
  return (
    <Menu label="Account" heading={login}
      items={[{ label: "Update from 42", href: LOGIN_URL }, { label: "Log out", title: LOGOUT_TITLE, onSelect: onLogout }]}
      button={
        <button type="button" data-test-id="account-button" title={login}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-active text-app-sm font-medium transition-colors duration-150 hover:bg-control">
          {/* The name comes from the hidden words, not aria-label, so it never differs from what is on screen */}
          <span aria-hidden="true">{initials}</span>
          <span className="sr-only">Account: {login}</span>
        </button>
      } />
  );
}

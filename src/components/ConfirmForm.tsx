"use client";

import type { ReactNode } from "react";

/** PHP's `data-confirm="…"` on a <form>: ask before submitting. The action is still a server action. */
export function ConfirmForm({ action, message, children, className }: { action: () => void | Promise<void>; message: string; children: ReactNode; className?: string }) {
  return (
    <form action={action} className={className} onSubmit={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </form>
  );
}

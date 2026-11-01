// Shared toast contract for the studio. Only client components import useToasts.
import { useCallback, useState } from "react";

export type ToastKind = "info" | "undo";
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;                                      // first line, for example `Removed "minishell"`
  detail?: string;                                   // optional second line
  action?: { label: string; onClick: () => void };   // undo toasts: { label: "Undo", onClick: handleUndo }
}
export type ToastInput = Omit<Toast, "id">;
export interface StudioToastsProps {
  toasts: Toast[];
  onClose: (id: number) => void;
}

let nextId = 1;
// One toast per kind: a new info toast replaces the old one, and so does a new undo toast.
// The undo toast sorts first, so it stacks above the info toast.
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((t: ToastInput) => {
    const toast: Toast = { ...t, id: nextId++ };
    setToasts((list) =>
      [...list.filter((x) => x.kind !== t.kind), toast].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "undo" ? -1 : 1)),
    );
    return toast.id;
  }, []);
  const closeToast = useCallback((id: number) => setToasts((list) => list.filter((x) => x.id !== id)), []);
  return { toasts, pushToast, closeToast };
}

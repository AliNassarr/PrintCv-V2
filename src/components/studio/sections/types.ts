import type { HelperTarget } from "@/lib/bullet-helper";

// A removed project or job, kept for its Undo toast (the toast stays until Undo, Close or the next removal)
export interface UndoBufferItem {
  id: string;
  type: "project" | "experience";
  label: string;
  item: any;
  index: number;
}

export interface SectionProps {
  collapsedItems: Record<string, boolean>;
  onToggleCollapse: (id: string) => void;
  onSoftDelete: (item: UndoBufferItem) => void;
  onOpenHelper: (kind: HelperTarget["kind"], id: string) => void;
  showToast: (toast: { title: string; desc: string }) => void;
}

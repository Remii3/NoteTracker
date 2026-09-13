import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  data?: {
    type: "chapter" | "topic";
    chapterId?: string;
  };
  className?: string;
};

export function SortableRow({
  id,
  children,
  active = false,
  disabled = false,
  data,
  className,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled, data });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative flex min-h-8 items-center gap-2 rounded-lg border border-transparent px-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sidebar-ring/50",
        active
          ? "border-sidebar-border bg-sidebar-accent"
          : "hover:bg-sidebar-accent/70",
        isDragging && "relative z-10 opacity-60 shadow-lg",
        className,
      )}
    >
      {!disabled && (
        <button
          type="button"
          aria-label="Przeciągnij, aby zmienić kolejność"
          className="grid size-9 shrink-0 touch-none cursor-grab place-items-center rounded-md text-muted-foreground opacity-30 hover:bg-background hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing md:size-6"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      {children}
    </div>
  );
}

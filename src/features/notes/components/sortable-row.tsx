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
        "relative flex items-center gap-1 rounded-lg pl-7 transition-colors",
        active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/70",
        isDragging && "relative z-10 opacity-60 shadow-lg",
        className,
      )}
    >
      {!disabled && (
        <button
          type="button"
          aria-label="Przeciągnij, aby zmienić kolejność"
          className="absolute left-0 grid size-7 touch-none cursor-grab place-items-center rounded-md text-muted-foreground opacity-30 hover:bg-background hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
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

"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";

import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  ...props
}: ProgressPrimitive.Root.Props) {
  return (
    <ProgressPrimitive.Root
      value={value}
      className={cn("w-full", className)}
      {...props}
    >
      <ProgressPrimitive.Track className="h-2 w-full overflow-hidden rounded-full bg-primary/10">
        <ProgressPrimitive.Indicator className="h-full rounded-full bg-primary transition-[width] duration-500" />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

export { Progress };

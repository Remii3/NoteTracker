import { useEffect, useLayoutEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  target: string;
  title: string;
  description: string;
  step: number;
  steps: number;
  onSkip: () => void;
  onTargetClick?: () => void;
};

type TargetRect = Pick<
  DOMRect,
  "top" | "right" | "bottom" | "left" | "width" | "height"
>;

export function SpotlightGuide({
  target,
  title,
  description,
  step,
  steps,
  onSkip,
  onTargetClick,
}: Props) {
  const [rect, setRect] = useState<TargetRect | null>(null);

  useLayoutEffect(() => {
    let element: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let animationFrame: number | null = null;
    const measure = () => {
      if (!element) return;
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        if (element) setRect(element.getBoundingClientRect());
      });
    };
    const reveal = () => {
      element ??= document.querySelector<HTMLElement>(target);
      if (!element) return;
      element.scrollIntoView({ block: "center", inline: "center" });
      measure();
    };
    reveal();
    if (element) {
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(element);
    }
    const mutationObserver = new MutationObserver(() => {
      if (element) return;
      element = document.querySelector<HTMLElement>(target);
      if (!element) return;
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(element);
      reveal();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [target]);

  useEffect(() => {
    if (!onTargetClick) return;
    let element: HTMLElement | null = null;
    const attach = () => {
      element ??= document.querySelector<HTMLElement>(target);
      element?.addEventListener("click", onTargetClick, { once: true });
    };
    attach();
    const observer = new MutationObserver(() => {
      if (!element) attach();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      element?.removeEventListener("click", onTargetClick);
    };
  }, [onTargetClick, target]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSkip();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onSkip]);

  if (!rect) return null;
  const gap = 7;
  const top = Math.max(0, rect.top - gap);
  const left = Math.max(0, rect.left - gap);
  const right = Math.min(window.innerWidth, rect.right + gap);
  const bottom = Math.min(window.innerHeight, rect.bottom + gap);
  const cardBelow = bottom + 16;
  const placeBelow = cardBelow + 190 < window.innerHeight;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40"
      role="dialog"
      aria-label={title}
    >
      <div
        className="pointer-events-auto absolute inset-x-0 top-0 bg-black/65"
        style={{ height: top }}
      />
      <div
        className="pointer-events-auto absolute left-0 bg-black/65"
        style={{ top, width: left, height: bottom - top }}
      />
      <div
        className="pointer-events-auto absolute right-0 bg-black/65"
        style={{ top, left: right, height: bottom - top }}
      />
      <div
        className="pointer-events-auto absolute inset-x-0 bottom-0 bg-black/65"
        style={{ top: bottom }}
      />
      <div
        className="pointer-events-none absolute rounded-lg ring-4 ring-primary ring-offset-2 ring-offset-background"
        style={{ top, left, width: right - left, height: bottom - top }}
      />
      <section
        className="pointer-events-auto absolute left-1/2 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border bg-background p-5 shadow-2xl"
        style={
          placeBelow
            ? { top: cardBelow }
            : { bottom: window.innerHeight - top + 16 }
        }
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
              Krok {step} z {steps}
            </p>
            <h2 className="mt-1 text-lg font-semibold">{title}</h2>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Pomiń przewodnik"
            onClick={onSkip}
          >
            <X />
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <p className="mt-4 text-xs font-medium text-primary">
          Kliknij podświetlony element, aby kontynuować.
        </p>
      </section>
    </div>
  );
}

import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TopicImage } from "../model/topic-image";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SCALE_STEP = 0.5;
const VIEWER_BUTTON_CLASS =
  "transition-[color,background-color,opacity,transform] duration-100 active:scale-95 active:not-aria-[haspopup]:translate-y-0!";

type Point = { x: number; y: number };

type Props = {
  images: TopicImage[];
  previewId: string | null;
  onPreviewChange: (id: string | null) => void;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function ImagePreviewDialog({
  images,
  previewId,
  onPreviewChange,
}: Props) {
  const image = images.find((item) => item.id === previewId);
  const imageIndex = image
    ? images.findIndex((item) => item.id === image.id)
    : -1;
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    origin: Point;
    offset: Point;
  } | null>(null);

  function resetView() {
    dragRef.current = null;
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  }

  function changeImage(direction: -1 | 1) {
    if (imageIndex < 0 || images.length < 2) return;
    const nextIndex = (imageIndex + direction + images.length) % images.length;
    resetView();
    onPreviewChange(images[nextIndex].id);
  }

  function changeScale(nextScale: number) {
    const normalized = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    setScale(normalized);
    if (normalized === MIN_SCALE) setOffset({ x: 0, y: 0 });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      scale === MIN_SCALE ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest("button")
    )
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      origin: { x: event.clientX, y: event.clientY },
      offset,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({
      x: drag.offset.x + event.clientX - drag.origin.x,
      y: drag.offset.y + event.clientY - drag.origin.y,
    });
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    changeScale(scale + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP));
  }

  useEffect(() => {
    if (!previewId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        changeImage(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        changeImage(1);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        changeScale(scale + SCALE_STEP);
      } else if (event.key === "-") {
        event.preventDefault();
        changeScale(scale - SCALE_STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        resetView();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  });

  return (
    <Dialog
      open={Boolean(image)}
      onOpenChange={(open) => {
        if (!open) {
          resetView();
          onPreviewChange(null);
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none bg-black p-0 text-white ring-0 data-closed:zoom-out-100 data-open:zoom-in-100 sm:max-w-none"
      >
        <DialogTitle className="sr-only">
          {image?.originalFilename ?? "Podgląd zdjęcia"}
        </DialogTitle>

        <div
          className={`relative min-h-0 flex-1 touch-none overflow-hidden ${
            scale > MIN_SCALE ? "cursor-grab active:cursor-grabbing" : ""
          }`}
          onDoubleClick={(event) => {
            if ((event.target as HTMLElement).closest("button")) return;
            if (scale === MIN_SCALE) changeScale(2);
            else resetView();
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onWheel={handleWheel}
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {image && (
              <img
                src={image.url}
                alt={image.originalFilename}
                draggable={false}
                className="block max-h-full max-w-full object-contain select-none"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                }}
              />
            )}
          </div>

          {images.length > 1 && (
            <>
              <div className="absolute top-1/2 left-3 -translate-y-1/2">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className={`rounded-full opacity-90 hover:opacity-100 active:bg-white/70 ${VIEWER_BUTTON_CLASS}`}
                  aria-label="Poprzednie zdjęcie"
                  onClick={() => changeImage(-1)}
                >
                  <ChevronLeft />
                </Button>
              </div>
              <div className="absolute top-1/2 right-3 -translate-y-1/2">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className={`rounded-full opacity-90 hover:opacity-100 active:bg-white/70 ${VIEWER_BUTTON_CLASS}`}
                  aria-label="Następne zdjęcie"
                  onClick={() => changeImage(1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-t border-white/15 bg-black/80 px-3">
          <p className="min-w-0 truncate text-xs text-white/70">
            {image?.originalFilename}
            {images.length > 1 && ` · ${imageIndex + 1} z ${images.length}`}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={`${VIEWER_BUTTON_CLASS} text-white hover:bg-white/15 hover:text-white active:bg-white/25`}
              disabled={scale === MIN_SCALE}
              aria-label="Pomniejsz zdjęcie"
              onClick={() => changeScale(scale - SCALE_STEP)}
            >
              <ZoomOut />
            </Button>
            <span className="w-12 text-center text-xs tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={`${VIEWER_BUTTON_CLASS} text-white hover:bg-white/15 hover:text-white active:bg-white/25`}
              disabled={scale === MAX_SCALE}
              aria-label="Powiększ zdjęcie"
              onClick={() => changeScale(scale + SCALE_STEP)}
            >
              <ZoomIn />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={`${VIEWER_BUTTON_CLASS} text-white hover:bg-white/15 hover:text-white active:bg-white/25`}
              disabled={scale === MIN_SCALE && offset.x === 0 && offset.y === 0}
              aria-label="Przywróć rozmiar zdjęcia"
              onClick={resetView}
            >
              <RotateCcw />
            </Button>
          </div>
        </div>
        <DialogClose
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={`absolute top-3 right-3 z-10 text-white hover:bg-white/15 hover:text-white active:bg-white/25 ${VIEWER_BUTTON_CLASS}`}
            />
          }
        >
          <X />
          <span className="sr-only">Zamknij podgląd</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

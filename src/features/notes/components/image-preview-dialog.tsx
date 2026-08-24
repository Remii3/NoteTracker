import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Move,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TopicImage } from "../model/topic-image";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SCALE_STEP = 0.5;
const PRECISE_SCALE_STEP = 0.1;
const PAN_STEP = 50;
const PRECISE_PAN_STEP = 15;
const PAN_MODE_STORAGE_KEY = "notetracker:image-viewer-pan-mode";
const VIEWER_BUTTON_CLASS =
  "transition-[color,background-color,opacity,transform] duration-100 active:scale-95 active:not-aria-[haspopup]:translate-y-0!";

type Point = { x: number; y: number };
type PanMode = "viewport" | "image";
type ViewMode = "contain" | "width";

type Props = {
  images: TopicImage[];
  previewId: string | null;
  onPreviewChange: (id: string | null) => void;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function constrainImageOffset(
  point: Point,
  scale: number,
  image: TopicImage | undefined,
  viewport: HTMLDivElement | null,
): Point {
  if (!viewport || !image || scale <= MIN_SCALE) return { x: 0, y: 0 };

  const fitScale = Math.min(
    1,
    viewport.clientWidth / image.width,
    viewport.clientHeight / image.height,
  );
  const renderedWidth = image.width * fitScale * scale;
  const renderedHeight = image.height * fitScale * scale;
  const maxX = Math.max(0, (renderedWidth - viewport.clientWidth) / 2);
  const maxY = Math.max(0, (renderedHeight - viewport.clientHeight) / 2);

  return {
    x: clamp(point.x, -maxX, maxX),
    y: clamp(point.y, -maxY, maxY),
  };
}

function getInitialPanMode(): PanMode {
  try {
    return localStorage.getItem(PAN_MODE_STORAGE_KEY) === "image"
      ? "image"
      : "viewport";
  } catch {
    return "viewport";
  }
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
  const [panMode, setPanMode] = useState<PanMode>(getInitialPanMode);
  const [viewMode, setViewMode] = useState<ViewMode>("contain");
  const viewportRef = useRef<HTMLDivElement>(null);
  const readerScrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    origin: Point;
    offset: Point;
  } | null>(null);

  function constrainOffset(point: Point, targetScale = scale): Point {
    return constrainImageOffset(point, targetScale, image, viewportRef.current);
  }

  function resetView() {
    dragRef.current = null;
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  }

  function changeImage(direction: -1 | 1) {
    if (imageIndex < 0 || images.length < 2) return;
    const nextIndex = (imageIndex + direction + images.length) % images.length;
    resetView();
    readerScrollRef.current?.scrollTo({ top: 0 });
    onPreviewChange(images[nextIndex].id);
  }

  function changeScale(nextScale: number) {
    const normalized = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    setScale(normalized);
    setOffset((current) => constrainOffset(current, normalized));
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
    setOffset(
      constrainOffset({
        x: drag.offset.x + event.clientX - drag.origin.x,
        y: drag.offset.y + event.clientY - drag.origin.y,
      }),
    );
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (viewMode === "width") return;
    event.preventDefault();
    const step = event.altKey ? PRECISE_SCALE_STEP : SCALE_STEP;
    changeScale(scale + (event.deltaY < 0 ? step : -step));
  }

  useEffect(() => {
    try {
      localStorage.setItem(PAN_MODE_STORAGE_KEY, panMode);
    } catch {
      // Preferencja nie jest krytyczna, jeśli pamięć przeglądarki jest niedostępna.
    }
  }, [panMode]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !image) return;
    const observer = new ResizeObserver(() => {
      setOffset((current) =>
        constrainImageOffset(current, scale, image, viewport),
      );
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [image, scale]);

  useEffect(() => {
    if (!previewId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey) return;

      const isHorizontalArrow =
        event.key === "ArrowLeft" || event.key === "ArrowRight";
      const isVerticalArrow =
        event.key === "ArrowUp" || event.key === "ArrowDown";
      const isZoomInKey =
        event.key === "+" ||
        event.key === "=" ||
        event.code === "Equal" ||
        event.code === "NumpadAdd";
      const isZoomOutKey =
        event.key === "-" ||
        event.code === "Minus" ||
        event.code === "NumpadSubtract";

      if (event.shiftKey && isHorizontalArrow) {
        event.preventDefault();
        event.stopPropagation();
        changeImage(event.key === "ArrowLeft" ? -1 : 1);
      } else if (viewMode === "width" && isVerticalArrow) {
        event.preventDefault();
        event.stopPropagation();
        const step = event.altKey ? PRECISE_PAN_STEP : PAN_STEP;
        readerScrollRef.current?.scrollBy({
          top: event.key === "ArrowUp" ? -step : step,
          behavior: "smooth",
        });
      } else if (
        viewMode === "contain" &&
        scale > MIN_SCALE &&
        (isHorizontalArrow || isVerticalArrow)
      ) {
        event.preventDefault();
        event.stopPropagation();
        const step = event.altKey ? PRECISE_PAN_STEP : PAN_STEP;
        const direction = panMode === "viewport" ? -1 : 1;
        setOffset((current) =>
          constrainOffset({
            x:
              current.x +
              (event.key === "ArrowLeft"
                ? -step * direction
                : event.key === "ArrowRight"
                  ? step * direction
                  : 0),
            y:
              current.y +
              (event.key === "ArrowUp"
                ? -step * direction
                : event.key === "ArrowDown"
                  ? step * direction
                  : 0),
          }),
        );
      } else if (isHorizontalArrow) {
        event.preventDefault();
        event.stopPropagation();
        changeImage(event.key === "ArrowLeft" ? -1 : 1);
      } else if (viewMode === "contain" && isZoomInKey) {
        event.preventDefault();
        changeScale(scale + (event.altKey ? PRECISE_SCALE_STEP : SCALE_STEP));
      } else if (viewMode === "contain" && isZoomOutKey) {
        event.preventDefault();
        changeScale(scale - (event.altKey ? PRECISE_SCALE_STEP : SCALE_STEP));
      } else if (event.key === "0") {
        event.preventDefault();
        resetView();
        readerScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
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
          ref={viewportRef}
          className={`relative min-h-0 flex-1 overflow-hidden ${viewMode === "width" ? "touch-pan-y" : "touch-none"} ${
            viewMode === "contain" && scale > MIN_SCALE
              ? "cursor-grab active:cursor-grabbing"
              : ""
          }`}
          onDoubleClick={(event) => {
            if ((event.target as HTMLElement).closest("button")) return;
            if (viewMode === "width") return;
            if (scale === MIN_SCALE) changeScale(2);
            else resetView();
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onWheel={handleWheel}
        >
          {viewMode === "contain" ? (
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
          ) : (
            <div
              ref={readerScrollRef}
              className="absolute inset-0 overflow-y-auto overscroll-contain"
            >
              {image && (
                <img
                  src={image.url}
                  alt={image.originalFilename}
                  draggable={false}
                  className="block h-auto w-full max-w-none select-none"
                />
              )}
            </div>
          )}

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
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={`${VIEWER_BUTTON_CLASS} text-white hover:bg-white/15 hover:text-white active:bg-white/25 ${viewMode === "width" ? "bg-white/15" : ""}`}
                    aria-label="Dopasuj zdjęcie do szerokości"
                    aria-pressed={viewMode === "width"}
                    onClick={() => {
                      resetView();
                      setViewMode((mode) =>
                        mode === "contain" ? "width" : "contain",
                      );
                    }}
                  />
                }
              >
                <BookOpen />
              </TooltipTrigger>
              <TooltipContent side="top">
                {viewMode === "width"
                  ? "Pokaż całe zdjęcie"
                  : "Dopasuj do szerokości"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={`${VIEWER_BUTTON_CLASS} text-white hover:bg-white/15 hover:text-white active:bg-white/25 ${panMode === "viewport" ? "bg-white/15" : ""}`}
                    aria-label={`Tryb przesuwania: ${panMode === "viewport" ? "widok" : "obraz"}`}
                    aria-pressed={panMode === "viewport"}
                    disabled={viewMode === "width"}
                    onClick={() =>
                      setPanMode((mode) =>
                        mode === "viewport" ? "image" : "viewport",
                      )
                    }
                  />
                }
              >
                <Move />
              </TooltipTrigger>
              <TooltipContent side="top">
                Tryb: przesuwanie {panMode === "viewport" ? "widoku" : "obrazu"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={`${VIEWER_BUTTON_CLASS} text-white hover:bg-white/15 hover:text-white active:bg-white/25`}
                    aria-label="Skróty klawiaturowe"
                  />
                }
              >
                <Keyboard />
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="end"
                className="block space-y-1.5 py-2"
              >
                <p>
                  {viewMode === "width"
                    ? "↑/↓: przewijanie zdjęcia"
                    : `Strzałki: przesuwanie ${panMode === "viewport" ? "widoku" : "obrazu"}`}
                </p>
                <p>Shift + ←/→: poprzednie lub następne zdjęcie</p>
                <p>Alt + strzałki: precyzyjne przesuwanie</p>
                <p>+/−: zoom · Alt/⌥: krok 10% · 0: reset</p>
              </TooltipContent>
            </Tooltip>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={`${VIEWER_BUTTON_CLASS} text-white hover:bg-white/15 hover:text-white active:bg-white/25`}
              disabled={viewMode === "width" || scale === MIN_SCALE}
              aria-label="Pomniejsz zdjęcie"
              onClick={(event) =>
                changeScale(
                  scale - (event.altKey ? PRECISE_SCALE_STEP : SCALE_STEP),
                )
              }
            >
              <ZoomOut />
            </Button>
            <span className="w-12 text-center text-xs tabular-nums">
              {viewMode === "width" ? "Szer." : `${Math.round(scale * 100)}%`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={`${VIEWER_BUTTON_CLASS} text-white hover:bg-white/15 hover:text-white active:bg-white/25`}
              disabled={viewMode === "width" || scale === MAX_SCALE}
              aria-label="Powiększ zdjęcie"
              onClick={(event) =>
                changeScale(
                  scale + (event.altKey ? PRECISE_SCALE_STEP : SCALE_STEP),
                )
              }
            >
              <ZoomIn />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={`${VIEWER_BUTTON_CLASS} text-white hover:bg-white/15 hover:text-white active:bg-white/25`}
              disabled={
                viewMode === "width" ||
                (scale === MIN_SCALE && offset.x === 0 && offset.y === 0)
              }
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

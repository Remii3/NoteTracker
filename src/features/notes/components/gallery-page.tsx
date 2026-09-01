import { ArrowUpDown, ArrowUpRight, Images, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  GalleryChapterSection,
  TopicImagesService,
} from "../data/topic-images-service";
import type { GalleryImage, TopicImage } from "../model/topic-image";
import type { SortMode } from "../model/workspace-types";
import { ImagePreviewDialog } from "./image-preview-dialog";

const SECTION_PAGE_SIZE = 4;
const CHAPTER_PAGE_SIZE = 6;
const SORT_LABELS: Record<SortMode, string> = {
  manual: "Kolejność ręczna",
  az: "Rozdziały A–Z",
  za: "Rozdziały Z–A",
  completed: "Ukończone najpierw",
  incomplete: "Nieukończone najpierw",
};

type Props = {
  moduleId: string;
  sortMode: SortMode;
  service?: TopicImagesService;
  onOpenTopic: (chapterId: string, topicId: string) => void;
};

export function GalleryPage({
  moduleId,
  sortMode,
  service,
  onOpenTopic,
}: Props) {
  const [gallerySort, setGallerySort] = useState(sortMode);
  const [sections, setSections] = useState<GalleryChapterSection[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasMoreChapters, setHasMoreChapters] = useState(Boolean(service));
  const [loadingChapterId, setLoadingChapterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sectionsRef = useRef(sections);
  const requestVersionRef = useRef(0);
  const sectionsLoadingRef = useRef(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const chapterRequestsRef = useRef(new Map<string, Promise<GalleryImage[]>>());
  const images = useMemo(
    () => sections.flatMap((section) => section.images),
    [sections],
  );

  function applySections(next: GalleryChapterSection[]) {
    sectionsRef.current = next;
    setSections(next);
  }

  async function loadSections() {
    if (!service || sectionsLoadingRef.current) return [];
    const requestVersion = requestVersionRef.current;
    const chapterOffset = sectionsRef.current.length;
    sectionsLoadingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const page = await service.listGallerySections(
        moduleId,
        gallerySort,
        SECTION_PAGE_SIZE,
        chapterOffset,
        CHAPTER_PAGE_SIZE,
      );
      if (requestVersion !== requestVersionRef.current) {
        for (const image of page.sections.flatMap((section) => section.images))
          URL.revokeObjectURL(image.url);
        return [];
      }
      applySections(
        chapterOffset
          ? [...sectionsRef.current, ...page.sections]
          : page.sections,
      );
      setHasMoreChapters(page.hasMore);
      return page.sections;
    } catch (caughtError) {
      if (requestVersion !== requestVersionRef.current) return [];
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udało się pobrać galerii.",
      );
      return [];
    } finally {
      if (requestVersion === requestVersionRef.current) {
        sectionsLoadingRef.current = false;
        setIsLoading(false);
        setHasLoaded(true);
      }
    }
  }

  function loadChapter(chapterId: string) {
    const pending = chapterRequestsRef.current.get(chapterId);
    if (pending) return pending;
    const requestVersion = requestVersionRef.current;
    const section = sectionsRef.current.find(
      (item) => item.chapterId === chapterId,
    );
    if (!service || !section?.hasMore) return Promise.resolve([]);
    setLoadingChapterId(chapterId);
    setError(null);
    const request = service
      .listChapterGallery(
        moduleId,
        chapterId,
        section.images.length,
        SECTION_PAGE_SIZE,
      )
      .then((page) => {
        if (requestVersion !== requestVersionRef.current) {
          for (const image of page.images) URL.revokeObjectURL(image.url);
          return [];
        }
        applySections(
          sectionsRef.current.map((item) =>
            item.chapterId === chapterId
              ? {
                  ...item,
                  images: [...item.images, ...page.images],
                  hasMore: page.hasMore,
                  total: page.total,
                }
              : item,
          ),
        );
        return page.images;
      })
      .catch((caughtError: unknown) => {
        if (requestVersion === requestVersionRef.current)
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Nie udało się pobrać kolejnych zdjęć.",
          );
        return [];
      })
      .finally(() => {
        chapterRequestsRef.current.delete(chapterId);
        if (requestVersion === requestVersionRef.current)
          setLoadingChapterId((current) =>
            current === chapterId ? null : current,
          );
      });
    chapterRequestsRef.current.set(chapterId, request);
    return request;
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && service) void loadSections();
    });
    return () => {
      cancelled = true;
    };
    // Pierwsza paczka jest pobierana po zmianie modułu, usługi lub sortowania.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallerySort, moduleId, service]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !hasMoreChapters || !service) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadSections();
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // Kolejne strony korzystają z aktualnej wartości sectionsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMoreChapters, service]);

  useEffect(
    () => () => {
      for (const image of sectionsRef.current.flatMap(
        (section) => section.images,
      ))
        URL.revokeObjectURL(image.url);
    },
    [],
  );

  function changeSort(nextSort: SortMode) {
    if (nextSort === gallerySort) return;
    requestVersionRef.current += 1;
    chapterRequestsRef.current.clear();
    sectionsLoadingRef.current = false;
    for (const image of sectionsRef.current.flatMap(
      (section) => section.images,
    ))
      URL.revokeObjectURL(image.url);
    applySections([]);
    setPreviewId(null);
    setHasLoaded(false);
    setHasMoreChapters(Boolean(service));
    setLoadingChapterId(null);
    setError(null);
    setGallerySort(nextSort);
  }

  function openTopic(image: GalleryImage) {
    setPreviewId(null);
    onOpenTopic(image.chapterId, image.topicId);
  }

  async function requestNextInChapter(current: TopicImage) {
    const image = current as GalleryImage;
    const section = sectionsRef.current.find(
      (item) => item.chapterId === image.chapterId,
    );
    if (!section || section.images.at(-1)?.id !== image.id) return null;
    if (section.hasMore)
      return (await loadChapter(section.chapterId))[0]?.id ?? false;
    if (images.at(-1)?.id === image.id && hasMoreChapters) {
      const nextSections = await loadSections();
      return nextSections[0]?.images[0]?.id ?? false;
    }
    return null;
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-medium text-primary">
              Twoje materiały
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Galeria</h1>
            <p className="mt-2 text-muted-foreground">
              Zdjęcia uporządkowane według rozdziałów.
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <ArrowUpDown /> {SORT_LABELS[gallerySort]}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Sortowanie galerii</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuRadioGroup
                value={gallerySort}
                onValueChange={(value) => changeSort(value as SortMode)}
              >
                {(Object.entries(SORT_LABELS) as [SortMode, string][]).map(
                  ([value, label]) => (
                    <DropdownMenuRadioItem key={value} value={value}>
                      {label}
                    </DropdownMenuRadioItem>
                  ),
                )}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {!service ? (
          <div className="mt-8 rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
            Galeria wymaga skonfigurowanego Workera zdjęć.
          </div>
        ) : sections.length ? (
          <div className="mt-10 space-y-10">
            {sections.map((section) => (
              <section key={section.chapterId}>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {section.chapterTitle}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {section.total === 1
                        ? "1 zdjęcie"
                        : `${section.total} zdjęć`}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {section.images.map((image) => (
                    <article
                      key={image.id}
                      className="group overflow-hidden rounded-xl border bg-background"
                    >
                      <button
                        type="button"
                        className="block aspect-4/3 w-full cursor-zoom-in overflow-hidden bg-muted/20"
                        onClick={() => setPreviewId(image.id)}
                      >
                        <img
                          src={image.url}
                          alt={image.originalFilename}
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        />
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-muted/30"
                        onClick={() => openTopic(image)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {image.topicTitle}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            Otwórz temat
                          </span>
                        </span>
                        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      </button>
                    </article>
                  ))}
                </div>
                {section.hasMore && (
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      disabled={loadingChapterId === section.chapterId}
                      onClick={() => void loadChapter(section.chapterId)}
                    >
                      {loadingChapterId === section.chapterId && (
                        <LoaderCircle className="animate-spin" />
                      )}
                      Pokaż więcej w rozdziale
                    </Button>
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : hasLoaded && !isLoading && !error ? (
          <div className="mt-8 rounded-xl border border-dashed py-14 text-center">
            <Images className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">Nie masz jeszcze żadnych zdjęć</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Dodaj zdjęcie w wybranym temacie, a pojawi się ono w galerii.
            </p>
          </div>
        ) : null}

        {isLoading && !sections.length && (
          <div className="mt-8 space-y-8">
            {Array.from({ length: 2 }, (_, section) => (
              <div key={section}>
                <Skeleton className="mb-4 h-7 w-48" />
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="aspect-4/3 rounded-xl" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {error && (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}
        {hasMoreChapters && (
          <div
            ref={loadMoreSentinelRef}
            className="flex h-24 items-center justify-center"
            aria-label="Ładowanie kolejnych rozdziałów"
          >
            {isLoading && (
              <LoaderCircle className="animate-spin text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      <ImagePreviewDialog
        images={images}
        previewId={previewId}
        onPreviewChange={setPreviewId}
        getDescription={(item) => {
          const image = item as GalleryImage;
          return `${image.topicTitle} · ${image.chapterTitle}`;
        }}
        onOpenDescription={(item) => openTopic(item as GalleryImage)}
        onRequestNext={requestNextInChapter}
      />
    </main>
  );
}

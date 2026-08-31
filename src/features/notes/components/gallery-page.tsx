import { ArrowUpRight, Images, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TopicImagesService } from "../data/topic-images-service";
import type { GalleryImage, TopicImage } from "../model/topic-image";
import { ImagePreviewDialog } from "./image-preview-dialog";

const PAGE_SIZE = 12;

type Props = {
  service?: TopicImagesService;
  onOpenTopic: (chapterId: string, topicId: string) => void;
};

export function GalleryPage({ service, onOpenTopic }: Props) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(Boolean(service));
  const [error, setError] = useState<string | null>(null);
  const imagesRef = useRef(images);
  const loadingRef = useRef(false);

  function applyImages(next: GalleryImage[]) {
    imagesRef.current = next;
    setImages(next);
  }

  async function loadMore() {
    if (!service || loadingRef.current) return [];
    loadingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const page = await service.listGallery(
        imagesRef.current.length,
        PAGE_SIZE,
      );
      applyImages([...imagesRef.current, ...page.images]);
      setHasMore(page.hasMore);
      return page.images;
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udało się pobrać galerii.",
      );
      return [];
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
      setHasLoaded(true);
    }
  }

  useEffect(() => {
    if (!service) return;
    void loadMore();
    // Pierwsza strona jest pobierana po zmianie instancji usługi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  useEffect(
    () => () => {
      for (const image of imagesRef.current) URL.revokeObjectURL(image.url);
    },
    [],
  );

  function openTopic(image: GalleryImage) {
    setPreviewId(null);
    onOpenTopic(image.chapterId, image.topicId);
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">
            Twoje materiały
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Galeria</h1>
          <p className="mt-2 text-muted-foreground">
            Wszystkie zdjęcia dodane do Twoich tematów.
          </p>
        </div>

        {!service ? (
          <div className="mt-8 rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
            Galeria wymaga skonfigurowanego Workera zdjęć.
          </div>
        ) : images.length ? (
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {images.map((image) => (
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
                      {image.chapterTitle}
                    </span>
                  </span>
                  <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                </button>
              </article>
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

        {isLoading && !images.length && (
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="aspect-4/3 rounded-xl" />
            ))}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {hasMore && images.length > 0 && (
          <div className="mt-8 flex justify-center">
            <Button variant="outline" disabled={isLoading} onClick={loadMore}>
              {isLoading && <LoaderCircle className="animate-spin" />}
              Pokaż więcej
            </Button>
          </div>
        )}
      </div>

      <ImagePreviewDialog
        images={images}
        previewId={previewId}
        onPreviewChange={setPreviewId}
        getDescription={(image) => {
          const galleryImage = image as GalleryImage;
          return `${galleryImage.topicTitle} · ${galleryImage.chapterTitle}`;
        }}
        onOpenDescription={(image: TopicImage) =>
          openTopic(image as GalleryImage)
        }
        hasMore={hasMore}
        onRequestMore={async () => (await loadMore())[0]?.id ?? null}
      />
    </main>
  );
}

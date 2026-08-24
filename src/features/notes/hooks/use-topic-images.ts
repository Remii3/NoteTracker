import { useCallback, useEffect, useRef, useState } from "react";

import type { TopicImagesService } from "../data/topic-images-service";
import type { TopicImage } from "../model/topic-image";

export function useTopicImages(
  service: TopicImagesService | undefined,
  topicId: string,
) {
  const [images, setImages] = useState<TopicImage[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(service && topicId));
  const [isUploading, setIsUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imagesRef = useRef(images);

  function applyImages(next: TopicImage[]) {
    imagesRef.current = next;
    setImages(next);
  }

  useEffect(
    () => () => {
      for (const image of imagesRef.current) URL.revokeObjectURL(image.url);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    if (!service || !topicId) {
      return;
    }
    void service
      .list(topicId)
      .then((items) => {
        if (!cancelled) applyImages(items);
      })
      .catch((caughtError: unknown) => {
        if (!cancelled)
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Nie udało się pobrać zdjęć.",
          );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [service, topicId]);

  const upload = useCallback(
    async (files: File[]) => {
      if (!service || !topicId || !files.length || isUploading) return false;
      setIsUploading(true);
      setError(null);
      try {
        const result = await service.upload(topicId, files);
        applyImages([...imagesRef.current, ...result.uploaded]);
        if (result.failed.length) {
          const filenames = result.failed
            .slice(0, 3)
            .map((failure) => failure.filename)
            .join(", ");
          const remaining = result.failed.length - 3;
          setError(
            `Nie udało się dodać: ${filenames}${remaining > 0 ? ` i ${remaining} więcej` : ""}.`,
          );
        }
        return result;
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Nie udało się dodać zdjęć.",
        );
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [isUploading, service, topicId],
  );

  const remove = useCallback(
    async (imageId: string) => {
      if (!service || removingId) return false;
      setRemovingId(imageId);
      setError(null);
      try {
        await service.remove(imageId);
        const removedImage = imagesRef.current.find(
          (image) => image.id === imageId,
        );
        if (removedImage) URL.revokeObjectURL(removedImage.url);
        applyImages(imagesRef.current.filter((image) => image.id !== imageId));
        return true;
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Nie udało się usunąć zdjęcia.",
        );
        return false;
      } finally {
        setRemovingId(null);
      }
    },
    [removingId, service],
  );

  return { error, images, isLoading, isUploading, remove, removingId, upload };
}

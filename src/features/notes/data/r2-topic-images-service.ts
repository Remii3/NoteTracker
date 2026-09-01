import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { prepareImage } from "../lib/prepare-image";
import type { GalleryImage, TopicImage } from "../model/topic-image";
import type {
  TopicImagesService,
  TopicImagesUploadResult,
} from "./topic-images-service";

type ImageMetadata = Omit<TopicImage, "url">;
type GalleryImageMetadata = Omit<GalleryImage, "url">;

export class R2TopicImagesService implements TopicImagesService {
  private readonly client: SupabaseClient<Database>;
  private readonly apiUrl: string;

  constructor(client: SupabaseClient<Database>, apiUrl: string) {
    this.client = client;
    this.apiUrl = apiUrl;
  }

  private async getAccessToken() {
    const { data, error } = await this.client.auth.getSession();
    if (error || !data.session) {
      throw new Error("Sesja wygasła. Zaloguj się ponownie.", { cause: error });
    }
    return data.session.access_token;
  }

  private async request(path: string, init?: RequestInit) {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      const messageByStatus: Partial<Record<number, string>> = {
        401: "Sesja wygasła. Zaloguj się ponownie.",
        413: "Zdjęcie jest zbyt duże.",
        429: "Wysyłasz zdjęcia zbyt szybko. Odczekaj chwilę i spróbuj ponownie.",
      };
      throw new Error(
        messageByStatus[response.status] ??
          "Nie udało się wykonać operacji na zdjęciu. Spróbuj ponownie.",
      );
    }
    return response;
  }

  private async attachUrls<T extends ImageMetadata>(images: T[]) {
    return Promise.all(
      images.map(async (image) => {
        const response = await this.request(`/images/${image.id}`);
        const blob = await response.blob();
        return { ...image, url: URL.createObjectURL(blob) };
      }),
    );
  }

  async list(topicId: string) {
    const response = await this.request(`/topics/${topicId}/images`);
    const { images } = (await response.json()) as { images: ImageMetadata[] };
    return this.attachUrls(images);
  }

  async listGallerySections(
    moduleId: string,
    sortMode: import("../model/workspace-types").SortMode,
    perChapterLimit: number,
    chapterOffset: number,
    chapterLimit: number,
  ) {
    const params = new URLSearchParams({
      moduleId,
      sort: sortMode,
      limit: String(perChapterLimit),
      chapterOffset: String(chapterOffset),
      chapterLimit: String(chapterLimit),
    });
    const response = await this.request(`/images?${params}`);
    const result = (await response.json()) as {
      sections: Array<{
        chapterId: string;
        chapterSlug: string;
        chapterTitle: string;
        images: GalleryImageMetadata[];
        hasMore: boolean;
        total: number;
      }>;
      hasMore: boolean;
    };
    return {
      sections: await Promise.all(
        result.sections.map(async (section) => ({
          ...section,
          images: await this.attachUrls(section.images),
        })),
      ),
      hasMore: result.hasMore,
    };
  }

  async listChapterGallery(
    moduleId: string,
    chapterId: string,
    offset: number,
    limit: number,
  ) {
    const params = new URLSearchParams({
      moduleId,
      chapterId,
      offset: String(offset),
      limit: String(limit),
    });
    const response = await this.request(`/images?${params}`);
    const result = (await response.json()) as {
      images: GalleryImageMetadata[];
      hasMore: boolean;
      total: number;
    };
    return {
      images: await this.attachUrls(result.images),
      hasMore: result.hasMore,
      total: result.total,
    };
  }

  async upload(topicId: string, files: File[]) {
    const images: ImageMetadata[] = [];
    const failed: TopicImagesUploadResult["failed"] = [];
    for (const sourceFile of files) {
      try {
        const prepared = await prepareImage(sourceFile);
        const formData = new FormData();
        formData.set("file", prepared.file);
        formData.set("originalFilename", sourceFile.name);
        formData.set("width", String(prepared.width));
        formData.set("height", String(prepared.height));
        const response = await this.request(`/topics/${topicId}/images`, {
          method: "POST",
          body: formData,
        });
        images.push((await response.json()) as ImageMetadata);
      } catch (error) {
        failed.push({
          filename: sourceFile.name,
          message:
            error instanceof Error
              ? error.message
              : "Nie udało się dodać zdjęcia.",
        });
      }
    }
    return { uploaded: await this.attachUrls(images), failed };
  }

  async remove(imageId: string) {
    await this.request(`/images/${imageId}`, { method: "DELETE" });
  }

  async reorder(topicId: string, imageIds: string[]) {
    const { error } = await this.client.rpc("reorder_topic_images", {
      target_topic_id: topicId,
      image_ids: imageIds,
    });
    if (error) {
      throw new Error("Nie udało się zapisać kolejności zdjęć.", {
        cause: error,
      });
    }
  }

  async removeAll(topicId: string) {
    await this.request(`/topics/${topicId}/images`, { method: "DELETE" });
  }

  async removeModuleImages(moduleId: string) {
    await this.request(`/modules/${moduleId}/images`, { method: "DELETE" });
  }
}

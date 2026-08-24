import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { prepareImage } from "../lib/prepare-image";
import type { TopicImage } from "../model/topic-image";
import type { TopicImagesService } from "./topic-images-service";

type ImageMetadata = Omit<TopicImage, "url">;

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
      throw new Error(
        response.status === 401
          ? "Sesja wygasła. Zaloguj się ponownie."
          : "Nie udało się wykonać operacji na zdjęciu. Spróbuj ponownie.",
      );
    }
    return response;
  }

  private async attachUrls(images: ImageMetadata[]) {
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

  async upload(topicId: string, files: File[]) {
    const images: ImageMetadata[] = [];
    for (const sourceFile of files) {
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
    }
    return this.attachUrls(images);
  }

  async remove(imageId: string) {
    await this.request(`/images/${imageId}`, { method: "DELETE" });
  }

  async removeAll(topicId: string) {
    await this.request(`/topics/${topicId}/images`, { method: "DELETE" });
  }
}

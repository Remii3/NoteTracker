interface Env {
  IMAGES: R2Bucket;
  AUTH_RATE_LIMITER: RateLimit;
  WRITE_RATE_LIMITER: RateLimit;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  ALLOWED_ORIGINS: string;
}

type User = { id: string };

type ImageRow = {
  id: string;
  topic_id: string;
  storage_key: string;
  original_filename: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  position: number;
};

type GalleryRow = Omit<ImageRow, "position"> & {
  image_position: number;
  topic_title: string;
  topic_slug: string;
  chapter_id: string;
  chapter_title: string;
  chapter_slug: string;
  chapter_total: number;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;
const MAX_FILENAME_LENGTH = 255;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(",").map((item) => item.trim());
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(request: Request, env: Env) {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  });
  const origin = allowedOrigin(request, env);
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function json(request: Request, env: Env, body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders(request, env),
  });
}

function bearerToken(request: Request) {
  return request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

async function authenticate(request: Request, env: Env) {
  const token = bearerToken(request);
  if (!token) return null;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  const value: unknown = await response.json();
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !UUID_PATTERN.test(value.id)
  ) {
    return null;
  }
  return { id: value.id };
}

function isUploadTooLarge(request: Request) {
  const contentLength = request.headers.get("Content-Length");
  if (!contentLength) return false;
  const bytes = Number(contentLength);
  return !Number.isFinite(bytes) || bytes > MAX_UPLOAD_BODY_BYTES;
}

async function databaseRequest(
  request: Request,
  env: Env,
  path: string,
  init?: RequestInit,
) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${bearerToken(request)}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

function imageResponse(row: ImageRow) {
  return {
    id: row.id,
    topicId: row.topic_id,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    format: row.format,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    position: row.position,
  };
}

async function listGalleryImages(request: Request, env: Env, url: URL) {
  const requestedOffset = Number(url.searchParams.get("offset") ?? 0);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 12);
  const moduleId = url.searchParams.get("moduleId") ?? "";
  const chapterId = url.searchParams.get("chapterId");
  const sortMode = url.searchParams.get("sort") ?? "manual";
  if (
    !Number.isInteger(requestedOffset) ||
    requestedOffset < 0 ||
    !Number.isInteger(requestedLimit) ||
    requestedLimit < 1 ||
    requestedLimit > 24 ||
    !UUID_PATTERN.test(moduleId) ||
    (chapterId !== null && !UUID_PATTERN.test(chapterId)) ||
    !["manual", "az", "za", "completed", "incomplete"].includes(sortMode)
  ) {
    return json(request, env, { error: "Invalid pagination" }, 400);
  }

  const queryLimit = requestedLimit + 1;
  const imagesResponse = await databaseRequest(
    request,
    env,
    chapterId
      ? "rpc/get_chapter_gallery_images"
      : "rpc/get_module_gallery_sections",
    {
      method: "POST",
      body: JSON.stringify(
        chapterId
          ? {
              target_module_id: moduleId,
              target_chapter_id: chapterId,
              page_offset: requestedOffset,
              page_limit: queryLimit,
            }
          : {
              target_module_id: moduleId,
              sort_mode: sortMode,
              per_chapter_limit: requestedLimit,
            },
      ),
    },
  );
  if (!imagesResponse.ok) throw new Error("Gallery image list failed");
  const rows = (await imagesResponse.json()) as GalleryRow[];
  const visibleRows = chapterId ? rows.slice(0, requestedLimit) : rows;
  const mapGalleryRow = (row: GalleryRow) => ({
    ...imageResponse({ ...row, position: row.image_position }),
    topicTitle: row.topic_title,
    topicSlug: row.topic_slug,
    chapterId: row.chapter_id,
    chapterTitle: row.chapter_title,
    chapterSlug: row.chapter_slug,
  });
  if (chapterId) {
    return json(request, env, {
      images: visibleRows.map(mapGalleryRow),
      hasMore: rows.length > requestedLimit,
      total: rows[0]?.chapter_total ?? requestedOffset,
    });
  }
  const sections = new Map<
    string,
    {
      chapterId: string;
      chapterSlug: string;
      chapterTitle: string;
      images: ReturnType<typeof mapGalleryRow>[];
      hasMore: boolean;
      total: number;
    }
  >();
  for (const row of rows) {
    const section = sections.get(row.chapter_id) ?? {
      chapterId: row.chapter_id,
      chapterSlug: row.chapter_slug,
      chapterTitle: row.chapter_title,
      images: [],
      hasMore: row.chapter_total > requestedLimit,
      total: row.chapter_total,
    };
    section.images.push(mapGalleryRow(row));
    sections.set(row.chapter_id, section);
  }
  return json(request, env, { sections: [...sections.values()] });
}

async function getImageRow(request: Request, env: Env, imageId: string) {
  const response = await databaseRequest(
    request,
    env,
    `topic_images?select=id,topic_id,storage_key,original_filename,format,width,height,bytes,position&id=eq.${encodeURIComponent(imageId)}`,
  );
  if (!response.ok) throw new Error("Image query failed");
  return ((await response.json()) as ImageRow[])[0] ?? null;
}

async function listImages(request: Request, env: Env, topicId: string) {
  const response = await databaseRequest(
    request,
    env,
    `topic_images?select=id,topic_id,storage_key,original_filename,format,width,height,bytes,position&topic_id=eq.${encodeURIComponent(topicId)}&order=position.asc,id.asc`,
  );
  if (!response.ok) throw new Error("Image list failed");
  const rows = (await response.json()) as ImageRow[];
  return json(request, env, { images: rows.map(imageResponse) });
}

async function uploadImage(
  request: Request,
  env: Env,
  user: User,
  topicId: string,
) {
  const topicResponse = await databaseRequest(
    request,
    env,
    `topics?select=id&id=eq.${encodeURIComponent(topicId)}&user_id=eq.${encodeURIComponent(user.id)}`,
  );
  if (!topicResponse.ok) throw new Error("Topic query failed");
  if (((await topicResponse.json()) as Array<{ id: string }>).length === 0) {
    return json(request, env, { error: "Topic not found" }, 404);
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const originalFilename = formData.get("originalFilename");
  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));
  if (
    !(file instanceof File) ||
    file.type !== "image/webp" ||
    file.size <= 0 ||
    file.size > MAX_FILE_BYTES ||
    typeof originalFilename !== "string" ||
    !originalFilename.trim() ||
    originalFilename.length > MAX_FILENAME_LENGTH ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return json(request, env, { error: "Invalid image" }, 400);
  }

  const imageId = crypto.randomUUID();
  const storageKey = `${user.id}/${topicId}/${imageId}.webp`;
  try {
    await env.IMAGES.put(storageKey, file.stream(), {
      httpMetadata: {
        contentType: "image/webp",
        contentDisposition: "inline",
      },
      customMetadata: { userId: user.id, topicId, imageId },
    });

    const positionResponse = await databaseRequest(
      request,
      env,
      `topic_images?select=position&topic_id=eq.${encodeURIComponent(topicId)}&order=position.desc&limit=1`,
    );
    const latest = positionResponse.ok
      ? ((await positionResponse.json()) as Array<{ position: number }>)[0]
      : null;
    const row = {
      id: imageId,
      topic_id: topicId,
      user_id: user.id,
      storage_key: storageKey,
      original_filename: originalFilename.trim(),
      format: "webp",
      width,
      height,
      bytes: file.size,
      position: (latest?.position ?? 0) + 1000,
    };
    const insertResponse = await databaseRequest(request, env, "topic_images", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    if (!insertResponse.ok) throw new Error("Image metadata insert failed");
    const inserted = ((await insertResponse.json()) as ImageRow[])[0];
    if (!inserted) throw new Error("Image metadata response was empty");
    return json(request, env, imageResponse(inserted), 201);
  } catch (error) {
    await Promise.allSettled([
      env.IMAGES.delete(storageKey),
      databaseRequest(
        request,
        env,
        `topic_images?id=eq.${encodeURIComponent(imageId)}`,
        { method: "DELETE" },
      ),
    ]);
    throw error;
  }
}

async function serveImage(request: Request, env: Env, imageId: string) {
  const row = await getImageRow(request, env, imageId);
  if (!row) return json(request, env, { error: "Image not found" }, 404);
  const object = await env.IMAGES.get(row.storage_key);
  if (!object) return json(request, env, { error: "Image not found" }, 404);
  const headers = new Headers(corsHeaders(request, env));
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}

async function deleteImage(request: Request, env: Env, imageId: string) {
  const row = await getImageRow(request, env, imageId);
  if (!row) return json(request, env, { error: "Image not found" }, 404);
  await env.IMAGES.delete(row.storage_key);
  const response = await databaseRequest(
    request,
    env,
    `topic_images?id=eq.${encodeURIComponent(imageId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error("Image metadata delete failed");
  return json(request, env, { success: true });
}

async function deleteTopicImages(
  request: Request,
  env: Env,
  user: User,
  topicId: string,
) {
  const prefix = `${user.id}/${topicId}/`;
  let cursor: string | undefined;
  do {
    const result = await env.IMAGES.list({ prefix, cursor });
    if (result.objects.length) {
      await env.IMAGES.delete(result.objects.map((object) => object.key));
    }
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  return json(request, env, { success: true });
}

async function deleteModuleImages(
  request: Request,
  env: Env,
  moduleId: string,
) {
  const response = await databaseRequest(
    request,
    env,
    "rpc/get_module_image_keys",
    { method: "POST", body: JSON.stringify({ target_module_id: moduleId }) },
  );
  if (!response.ok) throw new Error("Module image list failed");
  const rows = (await response.json()) as { storage_key: string }[];
  const keys = rows.map((row) => row.storage_key);
  for (let index = 0; index < keys.length; index += 1000) {
    await env.IMAGES.delete(keys.slice(index, index + 1000));
  }
  return json(request, env, { success: true, deleted: keys.length });
}

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: allowedOrigin(request, env) ? 204 : 403,
        headers: corsHeaders(request, env),
      });
    }

    const url = new URL(request.url);
    const galleryMatch = url.pathname === "/images";
    const topicMatch = url.pathname.match(/^\/topics\/([^/]+)\/images$/);
    const imageMatch = url.pathname.match(/^\/images\/([^/]+)$/);
    const moduleMatch = url.pathname.match(/^\/modules\/([^/]+)\/images$/);
    const allowedMethod =
      (galleryMatch && request.method === "GET") ||
      (topicMatch && ["GET", "POST", "DELETE"].includes(request.method)) ||
      (imageMatch && ["GET", "DELETE"].includes(request.method)) ||
      (moduleMatch && request.method === "DELETE");
    if (!allowedMethod) return json(request, env, { error: "Not found" }, 404);

    let resourceId = "";
    if (!galleryMatch) {
      try {
        resourceId = decodeURIComponent(
          (topicMatch ?? imageMatch ?? moduleMatch)?.[1] ?? "",
        );
      } catch {
        return json(request, env, { error: "Invalid identifier" }, 400);
      }
      if (!UUID_PATTERN.test(resourceId)) {
        return json(request, env, { error: "Invalid identifier" }, 400);
      }
    }

    if (topicMatch && request.method === "POST" && isUploadTooLarge(request)) {
      return json(request, env, { error: "Image is too large" }, 413);
    }

    const authKey = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const authLimit = await env.AUTH_RATE_LIMITER.limit({ key: authKey });
    if (!authLimit.success) {
      return json(request, env, { error: "Too many requests" }, 429);
    }
    const user = await authenticate(request, env);
    if (!user) return json(request, env, { error: "Unauthorized" }, 401);

    try {
      if (request.method !== "GET") {
        const writeLimit = await env.WRITE_RATE_LIMITER.limit({ key: user.id });
        if (!writeLimit.success) {
          return json(request, env, { error: "Too many requests" }, 429);
        }
      }
      if (galleryMatch) {
        return listGalleryImages(request, env, url);
      }
      if (moduleMatch && request.method === "DELETE") {
        return deleteModuleImages(request, env, resourceId);
      }
      if (topicMatch && request.method === "GET") {
        return listImages(request, env, resourceId);
      }
      if (topicMatch && request.method === "POST") {
        return uploadImage(request, env, user, resourceId);
      }
      if (topicMatch && request.method === "DELETE") {
        return deleteTopicImages(request, env, user, resourceId);
      }
      if (imageMatch && request.method === "GET") {
        return serveImage(request, env, resourceId);
      }
      if (imageMatch && request.method === "DELETE") {
        return deleteImage(request, env, resourceId);
      }
      return json(request, env, { error: "Not found" }, 404);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "Topic image operation failed",
          method: request.method,
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return json(request, env, { error: "Operation failed" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

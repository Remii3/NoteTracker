interface Env {
  IMAGES: R2Bucket;
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

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function corsHeaders(request: Request, env: Env) {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((item) => item.trim());
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin)
      ? origin
      : allowed[0],
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    Vary: "Origin",
  };
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
  return (await response.json()) as User;
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
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return json(request, env, { error: "Invalid image" }, 400);
  }

  const imageId = crypto.randomUUID();
  const storageKey = `${user.id}/${topicId}/${imageId}.webp`;
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
  if (!insertResponse.ok) {
    await env.IMAGES.delete(storageKey);
    throw new Error("Image metadata insert failed");
  }
  const inserted = ((await insertResponse.json()) as ImageRow[])[0];
  return json(request, env, imageResponse(inserted), 201);
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
  return new Response(object.body, { headers });
}

async function deleteImage(request: Request, env: Env, imageId: string) {
  const row = await getImageRow(request, env, imageId);
  if (!row) return json(request, env, { error: "Image not found" }, 404);
  const response = await databaseRequest(
    request,
    env,
    `topic_images?id=eq.${encodeURIComponent(imageId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error("Image metadata delete failed");
  await env.IMAGES.delete(row.storage_key);
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

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request, env) });
    }
    const user = await authenticate(request, env);
    if (!user) return json(request, env, { error: "Unauthorized" }, 401);

    try {
      const url = new URL(request.url);
      const topicMatch = url.pathname.match(/^\/topics\/([^/]+)\/images$/);
      const imageMatch = url.pathname.match(/^\/images\/([^/]+)$/);
      if (topicMatch && request.method === "GET") {
        return listImages(request, env, decodeURIComponent(topicMatch[1]));
      }
      if (topicMatch && request.method === "POST") {
        return uploadImage(
          request,
          env,
          user,
          decodeURIComponent(topicMatch[1]),
        );
      }
      if (topicMatch && request.method === "DELETE") {
        return deleteTopicImages(
          request,
          env,
          user,
          decodeURIComponent(topicMatch[1]),
        );
      }
      if (imageMatch && request.method === "GET") {
        return serveImage(request, env, decodeURIComponent(imageMatch[1]));
      }
      if (imageMatch && request.method === "DELETE") {
        return deleteImage(request, env, decodeURIComponent(imageMatch[1]));
      }
      return json(request, env, { error: "Not found" }, 404);
    } catch (error) {
      console.error(error);
      return json(request, env, { error: "Operation failed" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

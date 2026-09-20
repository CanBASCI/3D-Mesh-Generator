export const TRELLIS_SPACE = "https://microsoft-trellis-2.hf.space";

export function parseGradioSse(text: string): { data: unknown; queue?: string } {
  let event = "";
  let data: unknown;
  let queue: string | undefined;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (event === "error") {
      throw new Error(humanizeTrellisError(payload));
    }
    if (event === "complete") {
      data = JSON.parse(payload);
    }
    if (event === "estimation" || event === "process_generating") {
      try {
        const info = JSON.parse(payload) as { rank?: number; queue_size?: number };
        if (info.rank != null) queue = `Kuyruk ${info.rank + 1}/${Math.max(info.queue_size ?? 0, info.rank + 1)}`;
      } catch {
        /* ignore */
      }
    }
  }
  if (data === undefined) throw new Error("TRELLIS yanıt vermedi. Space uyanıyor veya kuyruk dolu olabilir.");
  return { data, queue };
}

export function humanizeTrellisError(raw: string): string {
  const text = raw.replace(/^"|"$/g, "");
  if (/gpu|quota|zero.?gpu|busy/i.test(text)) {
    return "TRELLIS GPU kuyruğu dolu. Biraz sonra tekrar dene.";
  }
  if (/log in|login|token|unauthorized/i.test(text)) {
    return "TRELLIS Space şu an giriş istiyor. Biraz sonra tekrar dene.";
  }
  return text.slice(0, 220) || "TRELLIS başarısız.";
}

type FileData = {
  path?: string | null;
  url?: string | null;
  orig_name?: string;
  mime_type?: string;
  meta?: { _type: string };
};

function fileData(pathOrUrl: string, name: string): FileData {
  const isUrl = /^https?:|^data:/.test(pathOrUrl);
  return {
    path: isUrl ? null : pathOrUrl,
    url: isUrl ? pathOrUrl : null,
    orig_name: name,
    mime_type: "image/png",
    meta: { _type: "gradio.FileData" },
  };
}

async function gradioCall(
  api: string,
  payload: unknown[],
  sessionHash: string,
  onStatus?: (text: string) => void,
): Promise<unknown> {
  const post = await fetch(`${TRELLIS_SPACE}/gradio_api/call/${api}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: payload, session_hash: sessionHash }),
  });
  if (!post.ok) {
    throw new Error(humanizeTrellisError(await post.text()));
  }
  const body = (await post.json()) as { event_id?: string };
  if (!body.event_id) throw new Error("TRELLIS oturumu açılamadı.");

  const stream = await fetch(`${TRELLIS_SPACE}/gradio_api/call/${api}/${body.event_id}`);
  if (!stream.ok) throw new Error(humanizeTrellisError(await stream.text()));
  const text = await stream.text();
  const parsed = parseGradioSse(text);
  if (parsed.queue) onStatus?.(parsed.queue);
  return parsed.data;
}

async function uploadPng(blob: Blob, sessionHash: string): Promise<string> {
  const form = new FormData();
  form.append("files", blob, "sprite.png");
  const res = await fetch(`${TRELLIS_SPACE}/gradio_api/upload?upload_id=${sessionHash}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Görsel TRELLIS’e yüklenemedi.");
  const paths = (await res.json()) as unknown;
  const first = Array.isArray(paths) ? paths[0] : null;
  if (typeof first !== "string" || !first) throw new Error("TRELLIS yükleme yanıtı boş.");
  return first;
}

function firstFileUrl(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstFileUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.url === "string" && rec.url) return rec.url;
    if (typeof rec.path === "string" && rec.path) return rec.path;
  }
  if (typeof value === "string" && /\.glb(\?|$)/i.test(value)) return value;
  return null;
}

function resolveSpaceUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${TRELLIS_SPACE}${path}`;
  return `${TRELLIS_SPACE}/gradio_api/file=${path}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Görsel okunamadı."));
    reader.readAsDataURL(blob);
  });
}

export async function generateTrellisGlb(
  png: Blob,
  onStatus?: (text: string) => void,
): Promise<ArrayBuffer> {
  const sessionHash = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  onStatus?.("TRELLIS oturumu açılıyor…");
  await gradioCall("start_session", [], sessionHash, onStatus);

  onStatus?.("Görsel yükleniyor…");
  let image: FileData;
  try {
    image = fileData(await uploadPng(png, sessionHash), "sprite.png");
  } catch {
    image = fileData(await blobToDataUrl(png), "sprite.png");
  }

  onStatus?.("Arka plan temizleniyor…");
  const pre = await gradioCall("preprocess_image", [image], sessionHash, onStatus);
  const preList = Array.isArray(pre) ? pre : [pre];
  const preImage = preList[0] ?? image;

  onStatus?.("TRELLIS 3D üretiyor… bu 30–90 sn sürebilir");
  await gradioCall(
    "image_to_3d",
    [
      preImage,
      0,
      "512",
      7.5,
      0.7,
      12,
      5,
      7.5,
      0.5,
      12,
      3,
      1,
      0,
      12,
      3,
    ],
    sessionHash,
    onStatus,
  );

  onStatus?.("GLB çıkarılıyor…");
  const extracted = await gradioCall("extract_glb", [200000, 1024], sessionHash, onStatus);
  const url = firstFileUrl(extracted);
  if (!url) throw new Error("TRELLIS GLB döndürmedi.");

  const glbRes = await fetch(resolveSpaceUrl(url));
  if (!glbRes.ok) throw new Error("GLB indirilemedi.");
  return glbRes.arrayBuffer();
}

export const TRELLIS_SPACE = "https://microsoft-trellis-2.hf.space";

type QueueMsg = {
  msg?: string;
  event_id?: string | null;
  rank?: number;
  queue_size?: number;
  success?: boolean;
  output?: { data?: unknown[]; error?: string | null };
};

export function parseQueueMessage(line: string): QueueMsg | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "ALIVE") return null;
  return JSON.parse(payload) as QueueMsg;
}

export function queueStatus(msg: QueueMsg): string | null {
  if (msg.msg === "estimation" && msg.rank != null) {
    const size = Math.max(msg.queue_size ?? 0, msg.rank + 1);
    return `Kuyruk ${msg.rank + 1}/${size}`;
  }
  if (msg.msg === "process_starts") return "TRELLIS üretiyor…";
  return null;
}

export function humanizeTrellisError(raw: string): string {
  const text = raw.replace(/^"|"$/g, "");
  if (text === "404: Not Found" || /session not found/i.test(text)) {
    return "TRELLIS oturumu koptu. Tekrar dene.";
  }
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

function fileData(path: string, name: string): FileData {
  return {
    path,
    url: null,
    orig_name: name,
    mime_type: "image/png",
    meta: { _type: "gradio.FileData" },
  };
}

type FnMap = Map<string, number>;

async function loadFnMap(): Promise<FnMap> {
  const res = await fetch(`${TRELLIS_SPACE}/config`);
  if (!res.ok) throw new Error("TRELLIS Space kapalı.");
  const cfg = (await res.json()) as { dependencies?: { api_name?: string | null }[] };
  const map: FnMap = new Map();
  cfg.dependencies?.forEach((dep, index) => {
    if (dep.api_name) map.set(dep.api_name, index);
  });
  return map;
}

function fnIndex(map: FnMap, name: string): number {
  const index = map.get(name);
  if (index == null) throw new Error(`TRELLIS fonksiyonu yok: ${name}`);
  return index;
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

function pump(res: Response, onChunk: (text: string) => void, signal: AbortSignal) {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  void (async () => {
    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        onChunk(decoder.decode(value, { stream: true }));
      }
    } catch {
      /* aborted */
    }
  })();
}

async function queueCall(
  fn: number,
  data: unknown[],
  sessionHash: string,
  onStatus?: (text: string) => void,
): Promise<unknown[]> {
  const ac = new AbortController();
  const stream = await fetch(
    `${TRELLIS_SPACE}/gradio_api/queue/data?session_hash=${encodeURIComponent(sessionHash)}`,
    { signal: ac.signal },
  );
  if (!stream.ok) throw new Error(humanizeTrellisError(await stream.text()));

  let buffer = "";
  let eventId = "";
  const pending: QueueMsg[] = [];
  let finish!: (msg: QueueMsg) => void;
  let fail!: (err: Error) => void;
  let settled = false;
  const done = new Promise<unknown[]>((resolve, reject) => {
    finish = (msg) => {
      if (settled) return;
      settled = true;
      if (!msg.success) {
        reject(new Error(humanizeTrellisError(msg.output?.error || "TRELLIS adımı başarısız.")));
      } else {
        resolve(msg.output?.data ?? []);
      }
      ac.abort();
    };
    fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
      ac.abort();
    };
  });
  ac.signal.addEventListener("abort", () => {
    if (!settled) fail(new Error("TRELLIS zaman aşımı. Space meşgul olabilir."));
  });

  const take = (msg: QueueMsg) => {
    if (!eventId) {
      pending.push(msg);
      return;
    }
    if (msg.event_id && msg.event_id !== eventId) return;
    const status = queueStatus(msg);
    if (status) onStatus?.(status);
    if (msg.msg === "process_completed" && msg.event_id === eventId) finish(msg);
  };

  pump(
    stream,
    (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const msg = parseQueueMessage(line);
          if (msg) take(msg);
        } catch {
          /* ignore partial frames */
        }
      }
    },
    ac.signal,
  );

  const join = await fetch(`${TRELLIS_SPACE}/gradio_api/queue/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, fn_index: fn, session_hash: sessionHash }),
  });
  if (!join.ok) {
    const err = new Error(humanizeTrellisError(await join.text()));
    fail(err);
    throw err;
  }
  const body = (await join.json()) as { event_id?: string };
  if (!body.event_id) {
    const err = new Error("TRELLIS kuyruğa alınamadı.");
    fail(err);
    throw err;
  }
  eventId = body.event_id;
  for (const msg of pending.splice(0)) take(msg);

  const timeout = window.setTimeout(() => fail(new Error("TRELLIS zaman aşımı. Space meşgul olabilir.")), 180_000);
  try {
    return await done;
  } finally {
    window.clearTimeout(timeout);
  }
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
    if (typeof rec.path === "string" && rec.path) {
      return `${TRELLIS_SPACE}/gradio_api/file=${rec.path}`;
    }
  }
  return null;
}

export async function generateTrellisGlb(
  png: Blob,
  onStatus?: (text: string) => void,
): Promise<ArrayBuffer> {
  const sessionHash = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const heart = new AbortController();
  const beat = await fetch(`${TRELLIS_SPACE}/gradio_api/heartbeat/${sessionHash}`, {
    signal: heart.signal,
  });
  pump(beat, () => {}, heart.signal);

  try {
    onStatus?.("TRELLIS bağlanıyor…");
    const fns = await loadFnMap();
    await queueCall(fnIndex(fns, "start_session"), [], sessionHash, onStatus);

    onStatus?.("Görsel yükleniyor…");
    const image = fileData(await uploadPng(png, sessionHash), "sprite.png");

    onStatus?.("Arka plan temizleniyor…");
    const pre = await queueCall(fnIndex(fns, "preprocess_image"), [image], sessionHash, onStatus);
    const prepared = (pre[0] as FileData | undefined) ?? image;

    onStatus?.("TRELLIS 3D üretiyor… bu 30–90 sn sürebilir");
    const generated = await queueCall(
      fnIndex(fns, "image_to_3d"),
      [prepared, 0, "512", 7.5, 0.7, 12, 5, 7.5, 0.5, 12, 3, 1, 0, 12, 3],
      sessionHash,
      onStatus,
    );
    const state = generated[0];
    if (!state) throw new Error("TRELLIS model durumu gelmedi.");

    onStatus?.("GLB çıkarılıyor…");
    const extracted = await queueCall(
      fnIndex(fns, "extract_glb"),
      [state, 200000, 1024],
      sessionHash,
      onStatus,
    );
    const url = firstFileUrl(extracted);
    if (!url) throw new Error("TRELLIS GLB döndürmedi.");
    const glbRes = await fetch(url);
    if (!glbRes.ok) throw new Error("GLB indirilemedi.");
    return glbRes.arrayBuffer();
  } finally {
    heart.abort();
  }
}

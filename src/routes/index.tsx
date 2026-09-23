import { createFileRoute } from "@tanstack/react-router";
import { Box, Download, Layers, RotateCcw, RotateCw, Upload, Wand2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { NinjaStage, type StageApi, type ViewMode } from "@/components/ninja-stage";
import { pickImageFile } from "@/lib/mesh/from-file";
import { generateTrellisGlb } from "@/lib/mesh/trellis";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

const FILE_ACCEPT =
  "image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.heic,.heif,.avif,.tif,.tiff";

function Home() {
  const [mode, setMode] = useState<ViewMode>("relief");
  const [puff, setPuff] = useState(1);
  const [autoRotate, setAutoRotate] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"glb" | "stl" | "import" | "trellis" | null>(null);
  const [api, setApi] = useState<StageApi | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [hasImported, setHasImported] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCount = useRef(0);
  const pendingFile = useRef<File | null>(null);

  const ready = Boolean(api) && busy !== "import";

  const importFile = useCallback(
    async (file: File) => {
      if (!api) {
        pendingFile.current = file;
        setStatus("Sahne açılıyor…");
        return;
      }
      setBusy("import");
      setStatus("Görsel okunuyor…");
      try {
        await api.importImage(file);
        setHasImported(true);
        setStatus(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "İçe aktarılamadı.";
        setStatus(message);
        window.setTimeout(() => setStatus(null), 2800);
      } finally {
        setBusy(null);
      }
    },
    [api],
  );

  const runTrellis = useCallback(async () => {
    if (!api) return;
    setBusy("trellis");
    setStatus("TRELLIS başlıyor…");
    try {
      const png = await api.getSpritePng();
      const glb = await generateTrellisGlb(png, setStatus);
      await api.loadTrellisGlb(glb);
      setStatus(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "TRELLIS başarısız.";
      setStatus(message);
      window.setTimeout(() => setStatus(null), 4200);
    } finally {
      setBusy(null);
    }
  }, [api]);

  useEffect(() => {
    if (!api || !pendingFile.current) return;
    const file = pendingFile.current;
    pendingFile.current = null;
    void importFile(file);
  }, [api, importFile]);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCount.current += 1;
      setDragOver(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCount.current = Math.max(0, dragCount.current - 1);
      if (dragCount.current === 0) setDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCount.current = 0;
      setDragOver(false);
      const file = pickImageFile(e.dataTransfer?.files);
      if (!file) {
        setStatus("Bu dosya bir görsel değil.");
        window.setTimeout(() => setStatus(null), 2400);
        return;
      }
      void importFile(file);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [importFile]);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = pickImageFile(e.target.files);
    e.target.value = "";
    if (file) void importFile(file);
  };

  const runDownload = useCallback(
    async (kind: "glb" | "stl") => {
      if (!api) return;
      setBusy(kind);
      try {
        if (kind === "glb") await api.downloadGLB();
        else await api.downloadSTL();
      } finally {
        setBusy(null);
      }
    },
    [api],
  );

  return (
    <main className="relative h-dvh overflow-hidden bg-bg text-fg">
      <NinjaStage
        mode={mode}
        puff={puff}
        autoRotate={autoRotate}
        onReady={setApi}
        onStatus={setStatus}
      />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
        <header className="pointer-events-auto max-w-xl shrink-0">
          <p className="text-xs font-medium tracking-[0.18em] text-muted" lang="en">
            FIGURE STUDIO
          </p>
          <h1 className="mt-1 font-semibold tracking-tight text-2xl sm:text-3xl">Shinobi 3D</h1>
          <p className="mt-1 hidden max-w-sm text-sm leading-snug text-muted sm:block">
            2D içe aktar → kabartma. İstersen TRELLIS ile gerçek 3D.
          </p>
        </header>

        <div className="pointer-events-none flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="hidden text-xs text-faint sm:block">Sürükle-bırak · çevir · yakınlaş</p>

          <section className="pointer-events-auto w-full rounded-xl border border-border bg-surface/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)] sm:w-auto sm:min-w-[22rem]">
            <input
              ref={inputRef}
              type="file"
              accept={FILE_ACCEPT}
              className="sr-only"
              onChange={onPick}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy === "import"}
              onClick={() => inputRef.current?.click()}
            >
              <Upload />
              {busy === "import" ? "Üretiliyor…" : "İçe aktar"}
            </Button>
            <Button
              type="button"
              variant="muted"
              className="mt-2 w-full"
              disabled={!ready || !hasImported || busy !== null}
              onClick={() => void runTrellis()}
            >
              <Wand2 />
              {busy === "trellis" ? "TRELLIS çalışıyor…" : "Gerçek 3D · TRELLIS"}
            </Button>

            <div className="mt-3 flex rounded-md bg-bg p-1">
              <ModeBtn
                active={mode === "relief"}
                onClick={() => setMode("relief")}
                icon={<Layers />}
                label="Kabartma"
              />
              <ModeBtn
                active={mode === "voxel"}
                onClick={() => setMode("voxel")}
                icon={<Box />}
                label="Voxel"
              />
            </div>

            <label className="mt-3 block">
              <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                Hacim
                <span className="tabular-nums text-fg">{puff.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={0.55}
                max={1.6}
                step={0.05}
                value={puff}
                onChange={(e) => setPuff(Number(e.target.value))}
                className="h-11 w-full cursor-pointer appearance-none bg-transparent accent-accent"
                aria-label="Hacim"
              />
            </label>

            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant={autoRotate ? "muted" : "outline"}
                size="icon"
                aria-pressed={autoRotate}
                aria-label="Otomatik döndür"
                onClick={() => setAutoRotate((v) => !v)}
              >
                <RotateCw />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Kamerayı sıfırla"
                onClick={() => api?.resetCamera()}
                disabled={!ready}
              >
                <RotateCcw />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={!ready || busy !== null}
                onClick={() => void runDownload("stl")}
              >
                {busy === "stl" ? "Hazırlanıyor" : "STL"}
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={!ready || busy !== null}
                onClick={() => void runDownload("glb")}
              >
                <Download />
                {busy === "glb" ? "Hazırlanıyor" : "GLB indir"}
              </Button>
            </div>
          </section>
        </div>
      </div>

      {dragOver ? (
        <div className="pointer-events-none absolute inset-4 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-bg/70">
          <p className="rounded-md bg-surface px-4 py-2 text-sm font-medium">
            Bırak — 2D görselden 3D üretilecek
          </p>
        </div>
      ) : null}

      {status ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-md bg-surface/90 px-4 py-2 text-sm text-muted">{status}</p>
        </div>
      ) : null}
    </main>
  );
}

function ModeBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-11 flex-1 items-center justify-center gap-2 rounded-sm text-sm font-medium transition-colors duration-150",
        active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

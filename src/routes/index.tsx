import { createFileRoute } from "@tanstack/react-router";
import { Box, Download, Layers, RotateCcw, RotateCw } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { NinjaStage, type StageApi, type ViewMode } from "@/components/ninja-stage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [mode, setMode] = useState<ViewMode>("relief");
  const [puff, setPuff] = useState(1);
  const [autoRotate, setAutoRotate] = useState(true);
  const [status, setStatus] = useState<string | null>("Figür hazırlanıyor…");
  const [busy, setBusy] = useState<"glb" | "stl" | null>(null);
  const [api, setApi] = useState<StageApi | null>(null);

  const ready = Boolean(api) && !status;

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
            2D görselinden kabartma figür. Sürükle, çevir, indir.
          </p>
        </header>

        <div className="pointer-events-none flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="hidden text-xs text-faint sm:block">Sürükle · çevir · yakınlaş</p>

          <section className="pointer-events-auto w-full rounded-xl border border-border bg-surface/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)] sm:w-auto sm:min-w-[22rem]">
            <div className="flex rounded-md bg-bg p-1">
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

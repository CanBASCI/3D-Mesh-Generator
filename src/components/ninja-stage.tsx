import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ViewMode = "relief" | "voxel";

export type StageApi = {
  setMode: (mode: ViewMode) => void;
  setPuff: (puff: number) => void;
  setAutoRotate: (value: boolean) => void;
  resetCamera: () => void;
  setBackground: (hex: string) => void;
  importImage: (file: File) => Promise<void>;
  getSpritePng: () => Promise<Blob>;
  loadTrellisGlb: (buffer: ArrayBuffer) => Promise<void>;
  downloadGLB: () => Promise<void>;
  downloadSTL: () => Promise<void>;
  dispose?: () => void;
};

const enginePromise = typeof window === "undefined" ? null : import("./ninja-engine");

type Props = {
  mode: ViewMode;
  puff: number;
  autoRotate: boolean;
  onReady: (api: StageApi) => void;
  onStatus: (text: string | null) => void;
};

export function NinjaStage({ mode, puff, autoRotate, onReady, onStatus }: Props) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const apiRef = useRef<StageApi | null>(null);
  const modeRef = useRef(mode);
  const puffRef = useRef(puff);
  const rotateRef = useRef(autoRotate);

  modeRef.current = mode;
  puffRef.current = puff;
  rotateRef.current = autoRotate;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!host || !enginePromise) return;
    let disposed = false;
    let dispose = () => {};

    void enginePromise.then(({ createNinjaSession }) => {
      if (disposed) return;
      const session = createNinjaSession(host, {
        getMode: () => modeRef.current,
        getPuff: () => puffRef.current,
        getAutoRotate: () => rotateRef.current,
        onStatus,
        onReady: (api) => {
          if (disposed) {
            api.dispose?.();
            return;
          }
          apiRef.current = api;
          onReady(api);
        },
      });
      dispose = session.dispose;
    });

    return () => {
      disposed = true;
      dispose();
      apiRef.current = null;
    };
    // Host mounts once. Live values are read from the refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  useEffect(() => {
    apiRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    apiRef.current?.setPuff(puff);
  }, [puff]);

  useEffect(() => {
    apiRef.current?.setAutoRotate(autoRotate);
  }, [autoRotate]);

  if (!mounted) return null;

  return createPortal(
    <div ref={setHost} className="pointer-events-auto fixed top-0 left-0 z-0 w-full touch-none" />,
    document.body,
  );
}
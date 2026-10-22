import { useCallback, useEffect, useState } from "react";

type FsDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function useFullscreen() {
  const doc = typeof document !== "undefined" ? (document as FsDocument) : null;
  const supported = !!doc && !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!doc) return;
    const onChange = () => setActive(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
    doc.addEventListener("fullscreenchange", onChange);
    doc.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      doc.removeEventListener("fullscreenchange", onChange);
      doc.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [doc]);

  const toggle = useCallback(() => {
    if (!doc) return;
    const el = doc.documentElement as FsElement;
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) void doc.exitFullscreen();
        else void doc.webkitExitFullscreen?.();
      } else if (el.requestFullscreen) {
        void el.requestFullscreen().catch(() => undefined);
      } else {
        void el.webkitRequestFullscreen?.();
      }
    } catch {
      // Fullscreen refused (e.g. inside an iframe without permission)
    }
  }, [doc]);

  return { supported, active, toggle };
}

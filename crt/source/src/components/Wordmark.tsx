import { LOGO_BRUSH_ASPECT, LOGO_BRUSH_URL, LOGO_RING_ASPECT, LOGO_RING_URL } from "@/visualizer/media/assets";

interface WordmarkProps {
  size?: "sm" | "lg";
}

/**
 * HOWL logotype. Large: the brushed wordmark crossed by the glowing signal line.
 * Small: the ring-O logo from howlny.com.
 */
export function Wordmark({ size = "lg" }: WordmarkProps) {
  const lg = size === "lg";
  const src = lg ? LOGO_BRUSH_URL : LOGO_RING_URL;
  const aspect = lg ? LOGO_BRUSH_ASPECT : LOGO_RING_ASPECT;
  return (
    <div className={`wr-wordmark ${lg ? "wr-wordmark--lg" : "wr-wordmark--sm"}`}>
      <img src={src} alt="HOWL" width={Math.round(320 * aspect)} height={320} decoding="async" draggable={false} />
    </div>
  );
}

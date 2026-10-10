"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { primaryButton, secondaryButton } from "@/components/shared/ui";

type CameraState = "idle" | "starting" | "active" | "denied" | "unsupported" | "error";

/** True when this exact code was just submitted (a held-up phone is seen on many consecutive frames). */
function seenRecently(ref: { current: { token: string; at: number } | null }, token: string) {
  const now = Date.now();
  const last = ref.current;
  if (last && last.token === token && now - last.at < 4000) return true;
  ref.current = { token, at: now };
  return false;
}

/**
 * Camera QR reader. The camera is only requested when the user presses Start. There is deliberately no manual
 * code entry: a check-in always comes from scanning the organizer's QR code.
 * It reads the video frames to decode the QR; it does not ask for or use the device's location.
 */
export function QrCamera({ onCode, disabled = false }: { onCode: (text: string) => void; disabled?: boolean }) {
  const [camera, setCamera] = useState<CameraState>("idle");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ token: string; at: number } | null>(null);
  const handlerRef = useRef(onCode);
  useEffect(() => { handlerRef.current = onCode; }, [onCode]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera("idle");
  }, []);
  useEffect(() => stop, [stop]); // release the camera when leaving the page

  function tick() {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!streamRef.current || !video || !canvas) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(video, 0, 0);
      const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      if (code?.data && !seenRecently(lastRef, code.data)) handlerRef.current(code.data.trim());
    }
    requestAnimationFrame(tick);
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) { setCamera("unsupported"); return; }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setCamera("active");
      tick();
    } catch (e) {
      setCamera((e as DOMException)?.name === "NotAllowedError" ? "denied" : "error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border border-border bg-black/90">
        <video ref={videoRef} muted playsInline className={camera === "active" ? "w-full" : "hidden"} />
        <canvas ref={canvasRef} className="hidden" />
        {camera !== "active" && (
          <p className="px-4 py-10 text-center text-sm text-white/80">
            {camera === "starting" ? "Starting camera…" : "The camera is off. Your browser will ask for camera permission when you start it."}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {camera === "active"
          ? <button type="button" className={secondaryButton} onClick={stop}>Stop camera</button>
          : <button type="button" className={primaryButton} onClick={() => void start()} disabled={camera === "starting" || disabled}>Start camera</button>}
      </div>

      {camera === "denied" && <p role="alert" className="text-sm text-danger">Camera access was blocked. Allow camera access for this site in your browser settings, then press Start camera again.</p>}
      {camera === "unsupported" && <p role="alert" className="text-sm text-danger">This browser or connection can&apos;t use a camera (camera access needs HTTPS or localhost). Try another browser or device.</p>}
      {camera === "error" && <p role="alert" className="text-sm text-danger">Couldn&apos;t start the camera. Check that no other app is using it, then try again.</p>}
    </div>
  );
}

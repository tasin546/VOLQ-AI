import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  FlipHorizontal,
  RefreshCw,
  VideoOff,
} from 'lucide-react';
import { Button, DialogModal } from '../ui/Primitives';
import type { ChatImageAttachment } from '../../lib/types';

interface CameraCaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (attachment: ChatImageAttachment) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  open,
  onOpenChange,
  onCapture,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [loadingCamera, setLoadingCamera] = useState(false);
  const [flashEffect, setFlashEffect] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Detect camera count
  useEffect(() => {
    if (!open) return;
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          setHasMultipleCameras(videoInputs.length > 1);
        })
        .catch(() => {});
    }
  }, [open]);

  // Start video stream when open
  const startCamera = useCallback(async () => {
    stopStream();
    setPermissionError(null);
    setLoadingCamera(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access in your browser settings.'
          : err instanceof DOMException && err.name === 'NotFoundError'
            ? 'No camera found on this device.'
            : 'Unable to access camera. Please check device permissions.';
      setPermissionError(message);
    } finally {
      setLoadingCamera(false);
    }
  }, [facingMode, stopStream]);

  useEffect(() => {
    if (open && !capturedDataUrl) {
      void startCamera();
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [open, startCamera, stopStream, capturedDataUrl]);

  // Handle snap
  const handleSnap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 150);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally if front camera for natural selfie look
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCapturedDataUrl(dataUrl);
    stopStream();
  };

  const handleRetake = () => {
    setCapturedDataUrl(null);
  };

  const handleUsePhoto = () => {
    if (!capturedDataUrl) return;
    const prefix = 'data:image/jpeg;base64,';
    const base64 = capturedDataUrl.startsWith(prefix)
      ? capturedDataUrl.slice(prefix.length)
      : capturedDataUrl.split(',')[1] || '';

    onCapture({
      mimeType: 'image/jpeg',
      dataBase64: base64,
    });
    setCapturedDataUrl(null);
    onOpenChange(false);
  };

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <DialogModal
      open={open}
      onOpenChange={(val) => {
        if (!val) {
          stopStream();
          setCapturedDataUrl(null);
        }
        onOpenChange(val);
      }}
      title="Camera Capture"
      description="Take a photo to attach directly to your prompt"
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4 pt-1">
        {/* Viewport container */}
        <div className="relative aspect-[4/3] w-full rounded-[var(--radius-lg)] overflow-hidden bg-black border border-[var(--border)] flex items-center justify-center">
          {capturedDataUrl ? (
            <img
              src={capturedDataUrl}
              alt="Captured preview"
              className="w-full h-full object-cover"
            />
          ) : permissionError ? (
            <div className="p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[var(--status-error-soft)] text-[var(--status-error)] flex items-center justify-center mx-auto">
                <VideoOff className="w-6 h-6" />
              </div>
              <p className="text-xs text-[var(--status-error)] font-medium max-w-xs mx-auto leading-relaxed">
                {permissionError}
              </p>
              <Button size="sm" variant="secondary" onClick={() => void startCamera()}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Retry camera access
              </Button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={`w-full h-full object-cover ${
                  facingMode === 'user' ? 'scale-x-[-1]' : ''
                }`}
              />
              {loadingCamera && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                  Starting camera...
                </div>
              )}
              {/* Flash effect overlay */}
              {flashEffect && <div className="absolute inset-0 bg-white z-20 pointer-events-none" />}
            </>
          )}

          {/* Flip camera button */}
          {!capturedDataUrl && !permissionError && hasMultipleCameras && (
            <button
              type="button"
              onClick={toggleCameraFacing}
              aria-label="Flip camera front/back"
              className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 active:scale-95 transition-all z-10"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 pt-2">
          {capturedDataUrl ? (
            <>
              <Button variant="secondary" onClick={handleRetake} className="flex-1">
                <RefreshCw className="w-4 h-4 mr-1.5" />
                Retake
              </Button>
              <Button variant="primary" onClick={handleUsePhoto} className="flex-1">
                <Check className="w-4 h-4 mr-1.5" />
                Attach Photo
              </Button>
            </>
          ) : !permissionError ? (
            <button
              type="button"
              onClick={handleSnap}
              disabled={loadingCamera}
              aria-label="Take photo"
              className="w-16 h-16 rounded-full border-4 border-white/80 p-1 flex items-center justify-center bg-white/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
            >
              <div className="w-full h-full rounded-full bg-white shadow-md" />
            </button>
          ) : null}
        </div>
      </div>
    </DialogModal>
  );
};

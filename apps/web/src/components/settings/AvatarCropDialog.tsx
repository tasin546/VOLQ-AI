import React, { useCallback, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Slider from '@radix-ui/react-slider';
import Cropper, { type Area } from 'react-easy-crop';
import { Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { getCsrfToken } from '../../lib/api';
import { Button } from '../ui/Primitives';

interface AvatarCropDialogProps {
  open: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onUploaded: (res: { hasAvatar: boolean; avatarVersion: string | null }) => void;
  onError: (message: string) => void;
}

async function getCroppedBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const size = Math.min(512, Math.max(256, Math.round(pixelCrop.width)));
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas unavailable');
  }

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    size,
    size
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Failed to encode cropped image'));
        else resolve(blob);
      },
      'image/png',
      0.95
    );
  });
}

export const AvatarCropDialog: React.FC<AvatarCropDialogProps> = ({
  open,
  imageSrc,
  onClose,
  onUploaded,
  onError,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const onCropComplete = useCallback((_croppedArea: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels || uploading) return;
    setUploading(true);
    setProgress(10);

    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels);
      if (blob.size > 5 * 1024 * 1024) {
        onError('Cropped image exceeds the 5 MB limit');
        setUploading(false);
        return;
      }

      const form = new FormData();
      form.append('file', blob, 'avatar.png');
      const csrf = getCsrfToken();

      const result = await new Promise<{ hasAvatar: boolean; avatarVersion: string | null }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/me/avatar');
          xhr.withCredentials = true;
          if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);

          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) {
              setProgress(Math.min(95, Math.round((ev.loaded / ev.total) * 90)));
            }
          };

          xhr.onload = () => {
            try {
              const parsed = JSON.parse(xhr.responseText || '{}') as {
                hasAvatar?: boolean;
                avatarVersion?: string | null;
                error?: string;
              };
              if (xhr.status >= 200 && xhr.status < 300 && parsed.hasAvatar) {
                resolve({
                  hasAvatar: true,
                  avatarVersion: parsed.avatarVersion ?? null,
                });
              } else {
                reject(new Error(parsed.error ?? `Upload failed (${xhr.status})`));
              }
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          };
          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.send(form);
        }
      );

      setProgress(100);
      onUploaded(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to upload profile picture');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !uploading) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[var(--scrim-bg)] backdrop-blur-[4px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-[calc(100vw-2rem)] max-w-md rounded-[var(--radius-xl)] liquid-glass-strong p-5 shadow-[var(--shadow)] outline-none space-y-4">
          <div>
            <Dialog.Title className="text-base font-semibold text-[var(--text)]">
              Crop profile picture
            </Dialog.Title>
            <Dialog.Description className="text-xs text-[var(--text-muted)] mt-0.5">
              Drag to reposition and use the slider to zoom.
            </Dialog.Description>
          </div>

          <div className="relative w-full h-64 rounded-[var(--radius-lg)] overflow-hidden bg-[var(--bg)] border border-[var(--border)]">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>

          <div className="flex items-center gap-3 px-1">
            <ZoomOut className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <Slider.Root
              value={[zoom]}
              min={1}
              max={3}
              step={0.05}
              aria-label="Zoom profile picture"
              onValueChange={(vals) => {
                if (typeof vals[0] === 'number') setZoom(vals[0]);
              }}
              className="relative flex items-center select-none touch-none w-full h-5"
            >
              <Slider.Track className="relative grow rounded-full h-1.5 bg-[var(--surface-active)] border border-[var(--border)]">
                <Slider.Range className="absolute h-full rounded-full bg-[var(--accent)]" />
              </Slider.Track>
              <Slider.Thumb className="block w-4 h-4 rounded-full bg-[var(--accent)] shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" />
            </Slider.Root>
            <ZoomIn className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          </div>

          {uploading && (
            <div className="space-y-1">
              <div className="h-1.5 rounded-full bg-[var(--surface-hover)] overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-[11px] text-[var(--text-muted)] text-right">{progress}%</div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5">
            <Button variant="ghost" disabled={uploading} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={uploading} onClick={() => void handleSave()}>
              {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {uploading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

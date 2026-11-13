import crypto from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_PIXEL_COUNT = 25_000_000;
const MAX_DIMENSION = 8000;
const AVATAR_SIZE = 256;

const ALLOWED_AVATAR_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export class AvatarValidationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'AvatarValidationError';
  }
}

export async function processAvatarUpload(inputBuffer: Buffer): Promise<{
  mimeType: 'image/webp';
  data: Buffer;
  etag: string;
}> {
  if (inputBuffer.length === 0) {
    throw new AvatarValidationError(400, 'Uploaded image is empty.');
  }
  if (inputBuffer.length > MAX_AVATAR_BYTES) {
    throw new AvatarValidationError(413, 'Profile picture exceeds the 5 MB limit.');
  }

  // Reject SVG text payloads up front even if disguised
  const headText = inputBuffer.subarray(0, 512).toString('utf8').trimStart();
  if (/^<\?xml|<svg[\s>]/i.test(headText)) {
    throw new AvatarValidationError(400, 'SVG images are not allowed for profile pictures.');
  }

  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try {
    detected = await fileTypeFromBuffer(inputBuffer);
  } catch {
    throw new AvatarValidationError(400, 'Invalid image file.');
  }

  if (!detected || !ALLOWED_AVATAR_MIMES.has(detected.mime)) {
    throw new AvatarValidationError(
      400,
      'Unsupported file format. Please upload a PNG, JPG, WEBP, or GIF image.'
    );
  }

  try {
    const pipeline = sharp(inputBuffer, {
      limitInputPixels: MAX_PIXEL_COUNT,
      animated: false,
      failOn: 'error',
    });

    const meta = await pipeline.metadata();
    if (
      !meta.width ||
      !meta.height ||
      meta.width > MAX_DIMENSION ||
      meta.height > MAX_DIMENSION ||
      meta.width * meta.height > MAX_PIXEL_COUNT
    ) {
      throw new AvatarValidationError(400, 'Image dimensions exceed allowed limits.');
    }

    // Re-encode to 256x256 WEBP; omitting .withMetadata() strips all EXIF/GPS/IPTC metadata
    const output = await sharp(inputBuffer, {
      limitInputPixels: MAX_PIXEL_COUNT,
      animated: false,
      failOn: 'error',
    })
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'center' })
      .webp({ quality: 82 })
      .toBuffer();

    const etag = `"${crypto.createHash('sha256').update(output).digest('hex').slice(0, 24)}"`;
    return {
      mimeType: 'image/webp',
      data: output,
      etag,
    };
  } catch (err) {
    if (err instanceof AvatarValidationError) throw err;
    throw new AvatarValidationError(400, 'Unable to decode uploaded image.');
  }
}

/**
 * Content-based image type detection ("magic byte" sniffing).
 *
 * The multipart `Content-Type` a client sends with an upload is
 * attacker-controlled and trivially spoofed — never trust it for a security
 * decision. This inspects the actual leading bytes of the buffer so a disguised
 * file (HTML/SVG/script renamed to `.png`, a polyglot, etc.) is rejected before
 * it is ever written to public storage.
 *
 * Deliberately narrow: only the four raster formats we accept for avatars.
 * SVG is intentionally excluded (it is XML and can carry embedded script).
 */

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** Canonical file extension per detected image type. */
export const IMAGE_EXTENSION: Record<ImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** The MIME types we accept for image uploads (derived from the signature map). */
export const ALLOWED_IMAGE_MIMES = Object.keys(IMAGE_EXTENSION) as ImageMime[];

/**
 * Detect a raster image type from its file signature. Returns the canonical
 * MIME string, or `null` when the bytes do not match a supported image format.
 */
export function detectImageMime(buffer: Buffer): ImageMime | null {
  // Every supported signature needs at least 12 bytes (WebP is the longest check).
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // GIF: ASCII "GIF87a" or "GIF89a"
  const gifMagic = buffer.toString('ascii', 0, 6);
  if (gifMagic === 'GIF87a' || gifMagic === 'GIF89a') {
    return 'image/gif';
  }

  // WebP: RIFF container — "RIFF" <4-byte size> "WEBP"
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }

  return null;
}

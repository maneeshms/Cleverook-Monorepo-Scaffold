import { detectImageMime, IMAGE_EXTENSION, ALLOWED_IMAGE_MIMES } from './image-signature';

/** Build a buffer from magic bytes padded to at least 12 bytes. */
const sig = (...bytes: number[]) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)]);

describe('detectImageMime', () => {
  it('detects a real JPEG signature', () => {
    expect(detectImageMime(sig(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
  });

  it('detects a real PNG signature', () => {
    expect(detectImageMime(sig(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
  });

  it('detects GIF87a and GIF89a', () => {
    expect(detectImageMime(Buffer.from('GIF87a' + '\0'.repeat(8)))).toBe('image/gif');
    expect(detectImageMime(Buffer.from('GIF89a' + '\0'.repeat(8)))).toBe('image/gif');
  });

  it('detects a WebP RIFF container', () => {
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP'),
      Buffer.alloc(4),
    ]);
    expect(detectImageMime(webp)).toBe('image/webp');
  });

  it('rejects an SVG (XML — can carry script) even though it looks image-y', () => {
    expect(detectImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
  });

  it('rejects HTML disguised with an image extension', () => {
    expect(detectImageMime(Buffer.from('<!DOCTYPE html><script>alert(1)</script>'))).toBeNull();
  });

  it('rejects a PDF', () => {
    expect(detectImageMime(Buffer.from('%PDF-1.7\n%âãÏÓ\n'))).toBeNull();
  });

  it('rejects a buffer that is too short to fingerprint', () => {
    expect(detectImageMime(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it('rejects an empty buffer without throwing', () => {
    expect(detectImageMime(Buffer.alloc(0))).toBeNull();
  });

  it('exposes a canonical extension for every allowed MIME', () => {
    for (const mime of ALLOWED_IMAGE_MIMES) {
      expect(IMAGE_EXTENSION[mime]).toMatch(/^[a-z]+$/);
    }
  });
});

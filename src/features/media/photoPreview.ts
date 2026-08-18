import { isHeifFile } from './photoFile';

export async function createPhotoPreviewUrl(blob: Blob, name = '') {
  const heif = isHeifFile({ name, type: blob.type });
  if (!heif) return URL.createObjectURL(blob);

  try {
    // heic-to bundles a newer libheif decoder and handles current iPhone HEIC files.
    const { heicTo } = await import('heic-to');
    const converted = await heicTo({ blob, type: 'image/jpeg', quality: 0.86 });
    return URL.createObjectURL(converted);
  } catch (modernError) {
    // Keep the older decoder as a compatibility fallback for legacy HEIF variants.
    try {
      const loaded = await import('heic2any');
      const heic2any = (loaded.default ?? loaded) as typeof import('heic2any').default;
      const converted = await heic2any({ blob, toType: 'image/jpeg', quality: 0.86 });
      const previewBlob = Array.isArray(converted) ? converted[0] : converted;
      return URL.createObjectURL(previewBlob);
    } catch (legacyError) {
      console.warn('HEIC preview conversion failed.', { modernError, legacyError, name });
      return '';
    }
  }
}

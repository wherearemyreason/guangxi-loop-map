const HEIF_EXTENSIONS = new Set(['.heic', '.heif']);

function hasHeifExtension(name: string) {
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
  return HEIF_EXTENSIONS.has(extension);
}

export function isHeifFile(file: Pick<File, 'name' | 'type'>) {
  return file.type.trim().toLowerCase().includes('heic')
    || file.type.trim().toLowerCase().includes('heif')
    || hasHeifExtension(file.name);
}

export function isPhotoFile(file: Pick<File, 'name' | 'type'>) {
  const type = file.type.trim().toLowerCase();
  return type.startsWith('image/') || isHeifFile(file);
}

export const PHOTO_ACCEPT = 'image/*,image/heic,image/heif,.heic,.heif';

import moderno1 from './assets/wallpapers/moderno-1.png';
import moderno2 from './assets/wallpapers/moderno-2.png';
import moderno3 from './assets/wallpapers/moderno-3.png';
import moderno4 from './assets/wallpapers/moderno-4.png';

type WallpaperOption = { id: string; label: string; image?: string };

export const wallpapers: readonly WallpaperOption[] = [
  { id: 'orbit', label: 'Órbita' },
  { id: 'lagoon', label: 'Lagoa' },
  { id: 'sunset', label: 'Horizonte' },
  { id: 'modern-1', label: 'Moderno 1', image: moderno1 },
  { id: 'modern-2', label: 'Moderno 2', image: moderno2 },
  { id: 'modern-3', label: 'Moderno 3', image: moderno3 },
  { id: 'modern-4', label: 'Moderno 4', image: moderno4 },
];

const imagePattern = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

export function isLocalImage(value: unknown): value is string {
  return typeof value === 'string' && imagePattern.test(value);
}

export function parseWallpaper(value: string | null): string {
  return value && (wallpapers.some(({ id }) => id === value) || imagePattern.test(value)) ? value : 'orbit';
}

export async function readWallpaperImage(file: File, maxDimension = 2560, maxEncodedLength = 2_800_000): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Escolha uma imagem PNG, JPEG ou WebP.');
  }
  if (file.size > 40 * 1024 * 1024) {
    throw new Error('Escolha uma imagem de até 40 MB.');
  }
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject();
    reader.onerror = reader.onabort = () => reject();
    reader.readAsDataURL(file);
  }).catch(() => { throw new Error('Não foi possível ler a imagem.'); });
  const image = new Image();
  image.src = source;
  await image.decode().catch(() => { throw new Error('Não foi possível abrir a imagem.'); });
  if (source.length <= maxEncodedLength && Math.max(image.naturalWidth, image.naturalHeight) <= maxDimension) return source;

  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível redimensionar a imagem.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.86, 0.72, 0.55, 0.4]) {
    const compressed = canvas.toDataURL('image/webp', quality);
    if (imagePattern.test(compressed) && compressed.length <= maxEncodedLength) return compressed;
    const jpeg = canvas.toDataURL('image/jpeg', quality);
    if (imagePattern.test(jpeg) && jpeg.length <= maxEncodedLength) return jpeg;
  }
  throw new Error('Não foi possível reduzir esta imagem. Escolha uma foto com dimensões menores.');
}

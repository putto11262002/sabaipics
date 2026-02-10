import exifr from 'exifr';
import { ResultAsync } from 'neverthrow';
import type { PhotoExifData } from '@sabaipics/db';

export type ExifError = { stage: 'exif_parse'; cause: unknown };

export function extractExif(
  imageBytes: ArrayBuffer,
): ResultAsync<PhotoExifData | null, ExifError> {
  return ResultAsync.fromPromise(
    exifr.parse(imageBytes, {
      pick: [
        'Make', 'Model', 'LensModel', 'FocalLength', 'ISO',
        'FNumber', 'ExposureTime', 'DateTimeOriginal',
        'GPSLatitude', 'GPSLongitude',
      ],
    }),
    (cause): ExifError => ({ stage: 'exif_parse', cause }),
  ).map((raw) => {
    if (!raw || Object.keys(raw).length === 0) return null;
    return {
      make: raw.Make ?? undefined,
      model: raw.Model ?? undefined,
      lensModel: raw.LensModel ?? undefined,
      focalLength: raw.FocalLength ?? undefined,
      iso: raw.ISO ?? undefined,
      fNumber: raw.FNumber ?? undefined,
      exposureTime: raw.ExposureTime ?? undefined,
      dateTimeOriginal: raw.DateTimeOriginal instanceof Date
        ? raw.DateTimeOriginal.toISOString()
        : undefined,
      gpsLatitude: raw.GPSLatitude ?? undefined,
      gpsLongitude: raw.GPSLongitude ?? undefined,
    };
  });
}

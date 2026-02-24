/**
 * Modal API client for image processing pipeline.
 *
 * Handles authentication via Proxy Auth Tokens and calls the Modal service
 * for auto-edit and LUT processing.
 */

import { err, ok, Result, ResultAsync } from 'neverthrow';

export interface ModalProcessOptions {
  autoEdit: boolean;
  autoEditIntensity?: number;
  normalizeMaxPx?: number;
  style?: string | null;
  contrast?: number;
  brightness?: number;
  saturation?: number;
  sharpness?: number;
  autoContrast?: boolean;
  lutBase64?: string | null;
  lutIntensity?: number;
  preserveLuminance?: boolean;
}

export interface ModalProcessResult {
  width: number;
  height: number;
  outputSize: number;
  operationsApplied: string[];
  exif: {
    make?: string;
    model?: string;
    lensModel?: string;
    focalLength?: number;
    iso?: number;
    fNumber?: number;
    exposureTime?: number;
    dateTimeOriginal?: string;
    gpsLatitude?: number;
    gpsLongitude?: number;
  } | null;
}

export interface ModalError {
  type: 'modal_api' | 'modal_response' | 'modal_timeout';
  message: string;
  cause?: unknown;
}

const MODAL_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Process an image through the Modal image pipeline.
 */
export function processWithModal(
  inputUrl: string,
  output: { url: string; headers: Record<string, string> },
  options: ModalProcessOptions,
  env: { MODAL_KEY: string; MODAL_SECRET: string },
): ResultAsync<ModalProcessResult, ModalError> {
  const body: Record<string, unknown> = {
    input_url: inputUrl,
    output_url: output.url,
    output_headers: output.headers,
    options: {
      normalize_max_px: options.normalizeMaxPx ?? 2500,
      auto_edit: options.autoEdit,
      auto_edit_intensity: options.autoEditIntensity ?? 100,
      style: options.style ?? null,
      contrast: options.contrast,
      brightness: options.brightness,
      saturation: options.saturation,
      sharpness: options.sharpness,
      auto_contrast: options.autoContrast,
      lut_base64: options.lutBase64 ?? null,
      lut_intensity: options.lutIntensity ?? 100,
      lut_preserve_luminance: options.preserveLuminance ?? false,
    },
  };

  return ResultAsync.fromPromise(
    fetch('https://putto11262002--framefast-image-pipeline-process.modal.run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Modal-Key': env.MODAL_KEY,
        'Modal-Secret': env.MODAL_SECRET,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(MODAL_TIMEOUT_MS),
    }),
    (cause): ModalError => ({
      type: 'modal_timeout',
      message: 'Modal request timed out',
      cause,
    }),
  ).andThen((response) => {
    if (!response.ok) {
      return ResultAsync.fromPromise(response.text(), () => ({
        type: 'modal_response' as const,
        message: 'Failed to read error response',
      })).andThen((text) =>
        err<ModalProcessResult, ModalError>({
          type: 'modal_api',
          message: `Modal API error: ${response.status} - ${text}`,
        }),
      );
    }

    return ResultAsync.fromPromise(
      response.json() as Promise<{
        width: number;
        height: number;
        output_size: number;
        operations_applied: string[];
        exif?: Record<string, unknown> | null;
        error?: string;
      }>,
      (cause): ModalError => ({
        type: 'modal_response',
        message: 'Failed to parse Modal response as JSON',
        cause,
      }),
    ).andThen((data) => {
      if (data.error) {
        return err<ModalProcessResult, ModalError>({
          type: 'modal_api',
          message: data.error,
        });
      }

      return ok<ModalProcessResult, ModalError>({
        width: data.width,
        height: data.height,
        outputSize: data.output_size,
        operationsApplied: data.operations_applied,
        exif: (data.exif as ModalProcessResult['exif']) ?? null,
      });
    });
  });
}

/**
 * Check if Modal is configured (has credentials).
 */
export function isModalConfigured(env: { MODAL_KEY?: string; MODAL_SECRET?: string }): boolean {
  return !!(env.MODAL_KEY && env.MODAL_SECRET);
}

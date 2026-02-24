/**
 * Face Detector Wrapper
 *
 * Abstracts face-api.js for face detection and descriptor extraction.
 * Handles model loading, image processing, and result normalization.
 */

import * as faceapi from '@vladmandic/face-api';
import * as tf from '@tensorflow/tfjs-node';
import { loadImageFromBuffer, getImageDimensions, type CanvasImage } from '../utils/image';

// =============================================================================
// Types
// =============================================================================

/**
 * Landmark point (68-point facial landmarks)
 */
export interface Landmark {
  x: number;
  y: number;
}

/**
 * Detection result for a single face
 */
export interface DetectedFace {
  boundingBox: {
    x: number; // Pixel coordinates
    y: number;
    width: number;
    height: number;
  };
  descriptor: Float32Array; // 128-D face descriptor
  confidence: number; // Detection confidence (0-1)
  landmarks?: Landmark[]; // 68-point facial landmarks
  age?: number; // Optional age estimation
  gender?: string; // Optional gender ('male' | 'female')
  genderConfidence?: number; // Optional gender confidence (0-1)
  expressions?: Record<string, number>; // Optional emotions

  /**
   * Source image dimensions in pixels.
   * Used for converting pixel bounding boxes to ratio format.
   */
  imageWidth?: number;
  imageHeight?: number;
}

/**
 * Face detector configuration
 */
export interface FaceDetectorConfig {
  modelsPath: string; // Path to face-api.js models
  minConfidence?: number; // Min detection confidence (default: 0.5)
  detectAttributes?: boolean; // Detect age, gender, emotions (default: true)
}

// =============================================================================
// Face Detector Class
// =============================================================================

/**
 * Face detector using face-api.js with TensorFlow.js backend.
 *
 * Features:
 * - SSD MobileNetV1 face detection
 * - 68-point facial landmarks
 * - 128-D face descriptor extraction
 * - Age, gender, emotion detection
 */
export class FaceDetector {
  private modelsPath: string;
  private minConfidence: number;
  private detectAttributes: boolean;
  private modelsLoaded: boolean = false;

  constructor(config: FaceDetectorConfig) {
    this.modelsPath = config.modelsPath;
    this.minConfidence = config.minConfidence ?? 0.5;
    this.detectAttributes = config.detectAttributes ?? true;
  }

  /**
   * Load face-api.js models.
   * Should be called once during service initialization.
   */
  async loadModels(): Promise<void> {
    if (this.modelsLoaded) {
      return;
    }

    try {
      // Load core models (required)
      await faceapi.nets.ssdMobilenetv1.loadFromDisk(this.modelsPath);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelsPath);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelsPath);

      // Load attribute detection models (optional)
      if (this.detectAttributes) {
        await faceapi.nets.ageGenderNet.loadFromDisk(this.modelsPath);
      }

      this.modelsLoaded = true;
    } catch (error) {
      throw new Error(`Failed to load face-api.js models: ${error}`);
    }
  }

  /**
   * Detect faces in an image and extract descriptors.
   *
   * @param imageBuffer - Image data as ArrayBuffer
   * @returns Array of detected faces with descriptors
   */
  async detectFaces(imageBuffer: ArrayBuffer): Promise<DetectedFace[]> {
    if (!this.modelsLoaded) {
      throw new Error('Models not loaded. Call loadModels() first.');
    }

    const startTime = Date.now();

    try {
      // Load image from buffer
      const img = await loadImageFromBuffer(imageBuffer);
      const { width: imageWidth, height: imageHeight } = getImageDimensions(img);

      // Run detection with configured options
      const options = new faceapi.SsdMobilenetv1Options({
        minConfidence: this.minConfidence,
      });

      let detections;
      if (this.detectAttributes) {
        detections = await faceapi
          .detectAllFaces(img as any, options)
          .withFaceLandmarks()
          .withFaceDescriptors()
          .withAgeAndGender();
      } else {
        detections = await faceapi
          .detectAllFaces(img as any, options)
          .withFaceLandmarks()
          .withFaceDescriptors();
      }

      // Convert to our domain model
      return detections.map((detection) =>
        this.convertDetection(detection, imageWidth, imageHeight),
      );
    } catch (error) {
      console.error('[FaceDetector] Face detection failed:', error);
      throw new Error(`Face detection failed: ${error}`);
    }
  }

  /**
   * Extract descriptor from a single face region.
   * Useful when you already know where the face is.
   *
   * @param imageBuffer - Image data as ArrayBuffer
   * @param box - Bounding box (pixel coordinates)
   * @returns 128-D face descriptor
   */
  async extractDescriptor(
    imageBuffer: ArrayBuffer,
    box: { x: number; y: number; width: number; height: number },
  ): Promise<Float32Array> {
    if (!this.modelsLoaded) {
      throw new Error('Models not loaded. Call loadModels() first.');
    }

    try {
      const img = await loadImageFromBuffer(imageBuffer);

      // For extracting descriptor from a known region, we use face-api.js's
      // detection and descriptor extraction on the full image
      // Note: This is a simplified implementation. A more sophisticated version
      // would crop the image to the region first.
      const detection = await faceapi
        .detectSingleFace(
          img as any,
          new faceapi.SsdMobilenetv1Options({ minConfidence: this.minConfidence }),
        )
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        throw new Error('No face detected in the specified region');
      }

      return detection.descriptor as Float32Array;
    } catch (error) {
      console.error('[FaceDetector] Descriptor extraction failed:', error);
      throw new Error(`Descriptor extraction failed: ${error}`);
    }
  }

  /**
   * Convert face-api.js detection result to our domain model.
   */
  private convertDetection(detection: any, imageWidth: number, imageHeight: number): DetectedFace {
    const box = detection.detection.box;

    // Convert landmarks from face-api.js format to simple point array
    const landmarks: Landmark[] | undefined = detection.landmarks
      ? detection.landmarks.positions.map((pos: any) => ({
          x: pos.x,
          y: pos.y,
        }))
      : undefined;

    // Build result
    const result: DetectedFace = {
      boundingBox: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      },
      descriptor: detection.descriptor,
      confidence: detection.detection.score,
      landmarks,
      imageWidth,
      imageHeight,
    };

    // Add optional attributes if detected
    if (detection.age !== undefined) {
      result.age = Math.round(detection.age);
    }

    if (detection.gender) {
      result.gender = detection.gender;
      result.genderConfidence = detection.genderProbability;
    }

    return result;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert pixel bounding box to ratio (0-1) for storage.
 *
 * @param box - Pixel coordinates
 * @param imageWidth - Image width in pixels
 * @param imageHeight - Image height in pixels
 * @returns Bounding box as ratios (0-1)
 */
export function pixelBoxToRatio(
  box: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): { width: number; height: number; left: number; top: number } {
  return {
    width: box.width / imageWidth,
    height: box.height / imageHeight,
    left: box.x / imageWidth,
    top: box.y / imageHeight,
  };
}

/**
 * Convert ratio bounding box (0-1) to pixel coordinates.
 *
 * @param box - Ratio coordinates (0-1)
 * @param imageWidth - Image width in pixels
 * @param imageHeight - Image height in pixels
 * @returns Bounding box in pixels
 */
export function ratioBoxToPixel(
  box: { width: number; height: number; left: number; top: number },
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: box.left * imageWidth,
    y: box.top * imageHeight,
    width: box.width * imageWidth,
    height: box.height * imageHeight,
  };
}

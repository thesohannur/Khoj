import * as faceapi from 'face-api.js';
export { matchAgainstRegistry } from './matching';

const MODEL_URL = '/models';
let modelsLoaded = false;
let modelLoadError = null;

export async function loadModels() {
  if (modelsLoaded) return;
  if (modelLoadError) throw modelLoadError;

  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  } catch (error) {
    console.error('Face model load failed:', error);
    modelLoadError = error;
    throw error;
  }
}

export async function computeDescriptor(imageElement) {
  await loadModels();

  const tinyOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 });
  const fallbackOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 });

  const primaryDetection = await faceapi
    .detectSingleFace(imageElement, tinyOptions)
    .withFaceLandmarks(true)
    .withFaceDescriptor();

  if (primaryDetection) return Array.from(primaryDetection.descriptor);

  const fallbackDetection = await faceapi
    .detectSingleFace(imageElement, fallbackOptions)
    .withFaceLandmarks(true)
    .withFaceDescriptor();

  if (fallbackDetection) return Array.from(fallbackDetection.descriptor);

  return null;
}

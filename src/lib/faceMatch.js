import * as faceapi from 'face-api.js';

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

export function matchAgainstRegistry(foundDescriptor, registeredPersons) {
  const queryDescriptor = new Float32Array(foundDescriptor);

  return registeredPersons
    .filter(person => person.face_descriptor)
    .map(person => {
      const storedDescriptor = new Float32Array(person.face_descriptor);
      const distance = faceapi.euclideanDistance(queryDescriptor, storedDescriptor);
      const confidence = Math.max(0, 1 - distance / 0.6);
      return { person, confidence };
    })
    .filter(result => result.confidence > 0.4)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

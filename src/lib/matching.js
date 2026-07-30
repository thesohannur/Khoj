// Pure descriptor-comparison math, no face-api.js/TensorFlow dependency —
// safe to import both client-side and in a lightweight Vercel function.

export function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Compare a found descriptor against a registry of { id, face_descriptor }
// (or any object with those fields). Returns top candidates sorted by
// confidence desc, confidence > 0.4 only.
export function matchAgainstRegistry(foundDescriptor, registry) {
  const queryDescriptor = Array.from(foundDescriptor);

  return registry
    .filter(entry => entry.face_descriptor)
    .map(entry => {
      const distance = euclideanDistance(queryDescriptor, entry.face_descriptor);
      const confidence = Math.max(0, 1 - distance / 0.6);
      return { entry, confidence };
    })
    .filter(result => result.confidence > 0.4)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

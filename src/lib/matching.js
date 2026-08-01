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

function toConfidence(distance) {
  return Math.max(0, 1 - distance / 0.6);
}

// Compare every query descriptor (e.g. front + side angles of a found
// person) against every candidate descriptor (a registered person's own
// front + side angles) and take the closest pairing — one good angle
// match is enough, so this only ever helps accuracy, never hurts it.
export function bestConfidence(queryDescriptors, candidateDescriptors) {
  let best = 0;
  for (const q of queryDescriptors) {
    for (const c of candidateDescriptors) {
      const confidence = toConfidence(euclideanDistance(q, c));
      if (confidence > best) best = confidence;
    }
  }
  return best;
}

// Compare a found descriptor set against a registry of
// { id, face_descriptors } (or any object with that field). Accepts
// either a single flat descriptor or an array of up to 3 for
// `foundDescriptors`. Falls back to a legacy singular `face_descriptor`
// field on registry entries, so an already-cached IndexedDB entry from
// before multi-photo support still matches correctly.
export function matchAgainstRegistry(foundDescriptors, registry) {
  const queries = (typeof foundDescriptors[0] === 'number' ? [foundDescriptors] : foundDescriptors)
    .map(d => Array.from(d));

  return registry
    .map(entry => {
      const candidates = entry.face_descriptors?.length
        ? entry.face_descriptors
        : (entry.face_descriptor ? [entry.face_descriptor] : []);
      return { entry, candidates };
    })
    .filter(({ candidates }) => candidates.length > 0)
    .map(({ entry, candidates }) => ({ entry, confidence: bestConfidence(queries, candidates) }))
    .filter(result => result.confidence > 0.4)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

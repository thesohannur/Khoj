import { createClient } from '@supabase/supabase-js';
import { bestConfidence } from '../src/lib/matching.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: { persistSession: false }
});

const CONFIDENCE_THRESHOLD = 0.4;
const SIGNED_URL_TTL_SECONDS = 300;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Accept the new plural field; fall back to a legacy singular
  // queryDescriptor so an old cached client tab mid-deploy still works.
  const { queryDescriptors, queryDescriptor, personIds } = req.body || {};
  const queries = queryDescriptors || (queryDescriptor ? [queryDescriptor] : null);

  if (!Array.isArray(queries) || queries.length === 0 || !Array.isArray(personIds) || personIds.length === 0) {
    return res.status(400).json({ error: 'queryDescriptors and personIds are required' });
  }

  try {
    // Fetch real stored descriptors via the service key (bypasses RLS) —
    // never trust a client-reported confidence for what gets revealed.
    const { data: persons, error } = await supabaseAdmin
      .from('persons')
      .select('id, name, name_bn, age, gender, district, photo_urls, display_photo_index, face_descriptors, photo_url, face_descriptor')
      .in('id', personIds);

    if (error) throw error;

    const candidates = [];
    for (const person of persons || []) {
      const storedDescriptors = person.face_descriptors?.length
        ? person.face_descriptors
        : (person.face_descriptor ? [person.face_descriptor] : []);
      if (storedDescriptors.length === 0) continue;

      const confidence = bestConfidence(queries, storedDescriptors);
      if (confidence <= CONFIDENCE_THRESHOLD) continue; // doesn't actually clear the bar — reject silently

      const displayPath = person.photo_urls?.[person.display_photo_index] ?? person.photo_urls?.[0] ?? person.photo_url;
      let signedPhotoUrl = null;
      if (displayPath) {
        const { data: signed } = await supabaseAdmin.storage
          .from('person-photos')
          .createSignedUrl(displayPath, SIGNED_URL_TTL_SECONDS);
        signedPhotoUrl = signed?.signedUrl || null;
      }

      candidates.push({
        id: person.id,
        name: person.name,
        name_bn: person.name_bn,
        age: person.age,
        gender: person.gender,
        district: person.district,
        confidence,
        signedPhotoUrl,
      });
    }

    return res.status(200).json({ candidates });
  } catch (err) {
    console.error('reveal-match error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

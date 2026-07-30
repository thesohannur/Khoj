import { createClient } from '@supabase/supabase-js';
import { euclideanDistance } from '../src/lib/matching.js';

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

  const { queryDescriptor, personIds } = req.body || {};

  if (!Array.isArray(queryDescriptor) || !Array.isArray(personIds) || personIds.length === 0) {
    return res.status(400).json({ error: 'queryDescriptor and personIds are required' });
  }

  try {
    // Fetch real stored descriptors via the service key (bypasses RLS) —
    // never trust a client-reported confidence for what gets revealed.
    const { data: persons, error } = await supabaseAdmin
      .from('persons')
      .select('id, name, name_bn, age, gender, district, photo_url, face_descriptor')
      .in('id', personIds);

    if (error) throw error;

    const candidates = [];
    for (const person of persons || []) {
      if (!person.face_descriptor) continue;

      const distance = euclideanDistance(queryDescriptor, person.face_descriptor);
      const confidence = Math.max(0, 1 - distance / 0.6);
      if (confidence <= CONFIDENCE_THRESHOLD) continue; // doesn't actually clear the bar — reject silently

      let signedPhotoUrl = null;
      if (person.photo_url) {
        const { data: signed } = await supabaseAdmin.storage
          .from('person-photos')
          .createSignedUrl(person.photo_url, SIGNED_URL_TTL_SECONDS);
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

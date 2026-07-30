import { createClient } from '@supabase/supabase-js';
import { sendTelegramAlert } from '../src/lib/telegramBot.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;

// Initialize admin supabase client to fetch person details bypassing RLS
const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: { persistSession: false }
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const payload = req.body;

  try {
    // Case 1: Inbound message from Telegram Bot Webhook
    if (payload.message) {
      const chatId = payload.message.chat.id;
      const text = payload.message.text || '';

      if (text.startsWith('/start')) {
        const replyText = `🎉 খোজে স্বাগতম (Welcome to Khoj)! \n\nআপনার টেলিগ্রাম চ্যাট আইডি (Chat ID) হলো: \`${chatId}\`\n\nহারানো সদস্যের তথ্য ও ছবি পাওয়ার জন্য নিবন্ধন ফর্মে এই চ্যাট আইডিটি ব্যবহার করুন।`;
        
        await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: replyText,
            parse_mode: 'Markdown'
          })
        });
      }
      return res.status(200).json({ success: true, message: 'Telegram update processed.' });
    }

    // Case 2: Inbound database webhook from Supabase (Triggered on INSERT in 'matches')
    if (payload.table === 'matches' && payload.type === 'INSERT') {
      const matchRecord = payload.record;
      const { person_id, report_id, confidence } = matchRecord;

      // 1. Fetch details of the registered person
      const { data: person, error: personErr } = await supabaseAdmin
        .from('persons')
        .select('*')
        .eq('id', person_id)
        .single();

      if (personErr || !person) {
        throw new Error(`Failed to fetch person: ${personErr?.message || 'Not found'}`);
      }

      // 2. Fetch details of the found report
      const { data: report, error: reportErr } = await supabaseAdmin
        .from('reports')
        .select('*')
        .eq('id', report_id)
        .single();

      if (reportErr || !report) {
        throw new Error(`Failed to fetch report: ${reportErr?.message || 'Not found'}`);
      }

      // 3. Send Telegram notification if chat ID is present
      if (person.telegram_chat_id) {
        console.log(`Sending Telegram alert to Chat ID: ${person.telegram_chat_id}`);

        // person.photo_url is a path in the private person-photos bucket,
        // not a fetchable URL — Telegram's sendPhoto needs a real one it
        // can reach, so sign it (or fall back to a text-only message).
        let signedPhotoUrl = null;
        if (person.photo_url) {
          const { data: signed } = await supabaseAdmin.storage
            .from('person-photos')
            .createSignedUrl(person.photo_url, 300);
          signedPhotoUrl = signed?.signedUrl || null;
        }

        await sendTelegramAlert(
          telegramBotToken,
          person.telegram_chat_id,
          { ...person, photo_url: signedPhotoUrl },
          report,
          confidence
        );

        // 4. Mark match as notified in database
        await supabaseAdmin
          .from('matches')
          .update({ notified: true })
          .eq('id', matchRecord.id);
      }

      return res.status(200).json({ success: true, message: 'Notification sent successfully.' });
    }

    // Fallback
    return res.status(400).json({ error: 'Unrecognized webhook payload structure.' });

  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

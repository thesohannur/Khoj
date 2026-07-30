export function buildTelegramMessage(person, report, confidence) {
  const confidencePct = Math.round(confidence * 100);
  const name = person.name_bn || person.name || 'একটি সদস্য';
  const location = report.location_name || 'অজানা';

  return `
🔍 *খোজ — সম্ভাব্য মিল পাওয়া গেছে*

আপনার নিবন্ধিত পরিবারের সদস্য *${name}* এর সাথে একটি রিপোর্টের ${confidencePct}% মিল পাওয়া গেছে।

📍 *স্থান:* ${location}
🕐 *সময়:* ${new Date(report.created_at || Date.now()).toLocaleString('bn-BD')}
  `.trim();
}

export async function sendTelegramAlert(token, chatId, person, report, confidence) {
  const message = buildTelegramMessage(person, report, confidence);
  
  if (person.photo_url) {
    // Send photo with description caption
    const url = `https://api.telegram.org/bot${token}/sendPhoto`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: person.photo_url,
        caption: message,
        parse_mode: 'Markdown'
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || 'Failed to send Telegram photo alert');
    return data;
  } else {
    // Fallback to text message
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || 'Failed to send Telegram text alert');
    return data;
  }
}

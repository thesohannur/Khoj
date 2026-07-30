function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3 style={{ margin: '0 0 0.75rem 0' }}>{title}</h3>
      {children}
    </div>
  );
}

function Steps({ items }) {
  return (
    <ol style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.7 }}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ol>
  );
}

export default function UserManual() {
  return (
    <div className="registration-card">
      <h2>User Guide / ব্যবহার নির্দেশিকা</h2>
      <p className="card-subtitle">
        Khoj — how to register family members before a crisis, and how to report and match a found or missing person during one.
      </p>

      <Section title="👤 Registering a Family Member / পরিবারের সদস্য নিবন্ধন">
        <p style={{ marginTop: 0 }}>
          Requires an account, so only your family can see the people you register. প্রয়োজন একটি অ্যাকাউন্ট — শুধুমাত্র আপনার পরিবার নিবন্ধিত ব্যক্তিদের দেখতে পারবে।
        </p>
        <Steps items={[
          'Open the "Register Member" tab and sign up or log in with an email and password.',
          'Fill in the person\'s name, age, gender, and district.',
          'Upload a clear, front-facing photo — wait for the "Face detected" confirmation before submitting.',
          'Optional: to receive Telegram notifications, message /start to the Khoj bot to get your chat ID, and enter it in the form.',
          'Submit. The person now appears in "Registered Family Members," visible only to your account.',
        ]} />
      </Section>

      <Section title="🔍 Reporting a Found Person / পাওয়া গেছে রিপোর্ট করুন">
        <p style={{ marginTop: 0 }}>
          No account needed — anyone at a shelter, hospital, or on the street can report. কোনো অ্যাকাউন্টের প্রয়োজন নেই।
        </p>
        <Steps items={[
          'Open the "Report Found" tab.',
          'Take or upload a photo of the person — wait for "Face detected."',
          'Fill in the location (use "Auto-fill Current GPS" or type it manually) and a brief description.',
          'Enter your own contact number, so the family can reach you if there\'s a match.',
          'Submit. If a likely match is found, a review screen appears showing the confidence and the candidate\'s photo — confirm it or mark it "Not a Match."',
        ]} />
      </Section>

      <Section title="⚠️ Reporting a Missing Person / নিখোঁজ ব্যক্তি রিপোর্ট করুন">
        <p style={{ marginTop: 0 }}>Also requires no account. Use this if someone you know is missing and hasn't been pre-registered.</p>
        <Steps items={[
          'Open the "Report Missing" tab.',
          'Upload a photo, and fill in the name, last-seen location, and time.',
          'Enter your contact number and submit.',
        ]} />
      </Section>

      <Section title="📡 Using Khoj Offline / অফলাইনে ব্যবহার">
        <p style={{ margin: 0 }}>
          Both reporting and matching work with no internet connection. Reports and registrations submitted offline are saved on your device and shown in the "Offline Queue Status" banner; they sync automatically — and matching continues to run, entirely on your device — the moment you're back online.
        </p>
      </Section>

      <Section title="🔔 Notifications / নোটিফিকেশন">
        <p style={{ margin: 0 }}>
          When a match is confirmed, the registering family gets a Bengali Telegram message with the found photo and the reporter's contact number. If a family member happens to have Khoj open at that moment, a banner also appears in the app immediately — but Telegram is the notification you can rely on even when the app is closed.
        </p>
      </Section>

      <Section title="🗺️ Crisis Map / ক্রাইসিস ম্যাপ">
        <p style={{ margin: 0 }}>
          The "Live Map" tab shows the locations of all found-person reports, visible to everyone, so families and volunteers can see where people are being located in real time.
        </p>
      </Section>

      <Section title="❓ Frequently Asked Questions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <strong>Why do I need an account to register, but not to report?</strong>
            <p style={{ margin: '0.25rem 0 0 0' }}>Registering stores a relative's photo and identity, so it's tied to your account and only visible to you. Reporting a found or missing person doesn't expose anyone's private data, so it's open to anyone helping during a crisis.</p>
          </div>
          <div>
            <strong>Who can see a registered person's photo?</strong>
            <p style={{ margin: '0.25rem 0 0 0' }}>Only your own account, until a genuine face match is found — at that point, the server independently re-verifies the match before revealing the photo to the reporter, and only for a short time.</p>
          </div>
          <div>
            <strong>What if there's no signal at all?</strong>
            <p style={{ margin: '0.25rem 0 0 0' }}>Registration, reporting, and matching all work fully offline. Only the Telegram notification and syncing to the shared database require a connection, and both happen automatically once you're back online.</p>
          </div>
        </div>
      </Section>
    </div>
  );
}

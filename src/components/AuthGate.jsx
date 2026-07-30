import { useState } from 'react';
import { signUp, signIn } from '../lib/auth';

export default function AuthGate({ onAuthenticated }) {
  const [mode, setMode] = useState('signup'); // signup | login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const session = mode === 'signup'
        ? await signUp(email, password)
        : await signIn(email, password);
      onAuthenticated(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="registration-card">
      <h2>{mode === 'signup' ? 'Create a Family Account' : 'Log In'} / পরিবারের একাউন্ট</h2>
      <p className="card-subtitle">
        Registering family members requires an account so only you can see and manage the people you register.
      </p>

      <form onSubmit={handleSubmit} className="register-form">
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            required
            minLength={6}
            placeholder="At least 6 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <div className="status-banner error">{error}</div>
        )}

        <button type="submit" className="submit-btn" disabled={submitting}>
          {submitting ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Log In'}
        </button>
      </form>

      <button
        className="secondary-btn"
        style={{ width: '100%', marginTop: '1rem' }}
        onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
      >
        {mode === 'signup' ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
      </button>
    </div>
  );
}

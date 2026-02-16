import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TiltCard from '../components/TiltCard.jsx';
import { fetchMyProfile, updateMyProfile } from '../services/userService.js';

function SettingsPage({ user, onUserUpdated }) {
  const isOmOverrideUser =
    String(user?.email || '').trim().toLowerCase() === 'ombakh28@gmail.com' ||
    String(user?.name || '').trim().toLowerCase() === 'om bakhshi';
  const minHandleLength = isOmOverrideUser ? 2 : 3;
  const handlePattern = isOmOverrideUser ? '^@?[A-Za-z0-9_]{2,20}$' : '^@?[A-Za-z0-9_]{3,20}$';

  const [form, setForm] = useState({
    name: '',
    handle: '',
    bio: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const me = await fetchMyProfile();
        if (active) {
          setForm({
            name: me.name || '',
            handle: me.handle || '',
            bio: me.bio || ''
          });
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || 'Could not load account settings');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [user]);

  function onChange(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const updated = await updateMyProfile(form);
      onUserUpdated(updated);
      setForm((current) => ({
        ...current,
        name: updated.name || current.name,
        handle: updated.handle || current.handle,
        bio: updated.bio || ''
      }));
      setSuccess('Profile updated.');
    } catch (updateError) {
      setError(updateError.message || 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <TiltCard as="section" className="card card--hero">
        <h1 className="page-title">Account Settings</h1>
        <p className="muted">
          <Link to="/login">Login</Link> to manage your profile.
        </p>
      </TiltCard>
    );
  }

  return (
    <TiltCard as="section" className="card card--hero">
      <h1 className="page-title">Account Settings</h1>
      <p className="muted">Update your display info and profile bio.</p>

      {loading ? <p className="muted">Loading settings...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {success ? <p className="muted">{success}</p> : null}

      {!loading ? (
        <form className="form-grid" onSubmit={onSubmit}>
          <input
            name="name"
            value={form.name}
            onChange={onChange}
            placeholder="Display name"
            required
          />
          <label className="handle-input" aria-label="Username">
            <span className="handle-input__prefix">@</span>
            <input
              name="handle"
              value={form.handle}
              onChange={onChange}
              placeholder="Username"
              required
              minLength={minHandleLength}
              maxLength={20}
              pattern={handlePattern}
              title={`Use ${minHandleLength}-20 letters, numbers, or underscores`}
            />
          </label>
          <textarea
            name="bio"
            value={form.bio}
            onChange={onChange}
            placeholder="Bio"
            rows={4}
            maxLength={280}
          />
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      ) : null}
    </TiltCard>
  );
}

export default SettingsPage;

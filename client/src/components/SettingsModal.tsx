import { useState, type FormEvent } from 'react';
import { X, Key, Trash2, CheckCircle } from 'lucide-react';
import { authApi } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

interface Props {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: Props) {
  const { user, refreshUser } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await authApi.saveApiKey(apiKey.trim());
      await refreshUser();
      setSuccess('API key saved successfully');
      setApiKey('');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to save API key');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Remove your Anthropic API key? You will not be able to generate summaries.')) return;
    setDeleting(true);
    setError('');
    try {
      await authApi.deleteApiKey();
      await refreshUser();
      setSuccess('API key removed');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to remove API key');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Settings
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Account info */}
        <div className="mb-5 p-3 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Signed in as</p>
          <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-primary)' }}>
            {user?.email}
          </p>
        </div>

        {/* API Key section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Key size={14} style={{ color: '#a5b4fc' }} />
            <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Anthropic API Key
            </h3>
            {user?.hasApiKey && (
              <span className="inline-flex items-center gap-1 ml-auto text-xs px-2 py-0.5 rounded-full"
                style={{ background: '#14532d', color: '#86efac' }}>
                <CheckCircle size={10} />
                Saved
              </span>
            )}
          </div>

          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            Your key is encrypted at rest and never shared. Used only to generate paper summaries on your behalf.
            Get a key at{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer"
              style={{ color: '#a5b4fc' }}>
              console.anthropic.com
            </a>
          </p>

          <form onSubmit={handleSave} className="space-y-3">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={user?.hasApiKey ? 'Enter new key to replace existing…' : 'sk-ant-…'}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#3b1a1a', color: 'var(--danger)' }}>
                {error}
              </p>
            )}
            {success && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#14532d', color: '#86efac' }}>
                {success}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving || !apiKey.trim()}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-opacity"
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  opacity: saving || !apiKey.trim() ? 0.5 : 1,
                  cursor: saving || !apiKey.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : user?.hasApiKey ? 'Update Key' : 'Save Key'}
              </button>

              {user?.hasApiKey && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="p-2 rounded-lg transition-opacity"
                  style={{
                    background: '#3b1a1a',
                    color: 'var(--danger)',
                    opacity: deleting ? 0.5 : 1,
                  }}
                  title="Remove API key"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

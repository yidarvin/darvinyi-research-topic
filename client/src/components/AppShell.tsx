import { useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Network, BookMarked, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import SettingsModal from './SettingsModal';

interface Props {
  children: ReactNode;
}

export default function AppShell({ children }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Top nav */}
      <header
        className="shrink-0 flex items-center justify-between px-4 h-12"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
      >
        {/* Brand */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 font-semibold text-sm"
          style={{ color: 'var(--text-primary)' }}
        >
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: 'var(--accent)' }}
          >
            <Network size={13} color="white" />
          </div>
          Research Graph
        </button>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: location.pathname === '/' ? 'var(--bg-card)' : 'transparent',
              color: location.pathname === '/' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <Network size={13} />
            Explore
          </button>

          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: location.pathname === '/dashboard' ? 'var(--bg-card)' : 'transparent',
              color: location.pathname === '/dashboard' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <BookMarked size={13} />
            Saved
          </button>
        </nav>

        {/* User actions */}
        <div className="flex items-center gap-2">
          {!user?.hasApiKey && (
            <button
              onClick={() => setShowSettings(true)}
              className="text-xs px-2.5 py-1.5 rounded-lg font-medium animate-pulse"
              style={{ background: '#1e1b4b', color: '#a5b4fc' }}
            >
              Add API key
            </button>
          )}

          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            title="Settings"
          >
            <Settings size={15} />
          </button>

          <button
            onClick={logout}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

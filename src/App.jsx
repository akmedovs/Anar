// import { useState } from 'react'



// function App() {

//   return (
//     <>
  
//     </>
//   )
// }

// export default App
import { Component, useEffect, useState } from 'react';
import { BrowserRouter as Router, Link, useLocation } from 'react-router-dom';
import { FiMenu, FiX, FiLayout, FiTable, FiDroplet, FiSettings, FiEdit3, FiStar, FiPieChart, FiTag } from 'react-icons/fi';
import AppRoutes from './routes';
import { theme } from './constants/theme';
import { useIsMobile } from './hooks/useIsMobile';
import { authApi } from './api/reports';

function App() {
  const [auth, setAuth] = useState(() => loadAuth());
  const [checkingAuth, setCheckingAuth] = useState(Boolean(loadAuth().token));
  const isResetPage = typeof window !== 'undefined' && window.location.pathname === '/reset-password';

  useEffect(() => {
    const current = loadAuth();
    if (!current.token) {
      setCheckingAuth(false);
      return;
    }

    authApi.me()
      .then((result) => {
        saveAuth(current.token, result.user);
        setAuth({ token: current.token, user: result.user });
      })
      .catch(() => {
        clearAuth();
        setAuth({ token: '', user: null });
      })
      .finally(() => setCheckingAuth(false));
  }, []);

  if (isResetPage) {
    return <ResetPasswordScreen />;
  }

  if (checkingAuth) {
    return <main style={loginPage}><div style={loginCard}>Giriş yoxlanılır...</div></main>;
  }

  if (!auth.token) {
    return <LoginScreen onLogin={(nextAuth) => setAuth(nextAuth)} />;
  }

  return (
    <Router>
      <Shell user={auth.user} onLogout={() => {
        clearAuth();
        setAuth({ token: '', user: null });
      }} />
    </Router>
  );
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submitLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const result = await authApi.login({ username, password });
      saveAuth(result.token, result.user);
      setError('');
      onLogin({ token: result.token, user: result.user });
    } catch (authError) {
      setError(authError.message);
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const result = await authApi.requestPasswordReset({ email: resetIdentifier, username: resetIdentifier });
      setMessage(result.message || 'Reset link göndərildi.');
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={loginPage}>
      <form style={loginCard} onSubmit={showReset ? submitReset : submitLogin}>
        <img src="/akmedovs-logo.jpeg?v=20260720" alt="Akmedovs" style={loginLogo} />
        <div style={loginEyebrow}>Akmedovs</div>
        <h1 style={loginTitle}>{showReset ? 'Şifrəni yenilə' : 'Sistemə giriş'}</h1>
        <p style={loginSub}>{showReset ? 'Email və ya istifadəçi adını yaz, reset linki göndərilsin.' : 'Kirayə və Aftoyuma idarəetmə panelinə daxil ol.'}</p>

        {showReset ? (
          <label style={loginLabel}>
            Email və ya istifadəçi adı
            <input
              value={resetIdentifier}
              onChange={(event) => setResetIdentifier(event.target.value)}
              autoComplete="username"
              style={loginInput}
              autoFocus
            />
          </label>
        ) : (
          <>
            <label style={loginLabel}>
              İstifadəçi adı
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                style={loginInput}
                autoFocus
              />
            </label>

            <label style={loginLabel}>
              Şifrə
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                style={loginInput}
              />
            </label>
          </>
        )}

        {error ? <div style={loginError}>{error}</div> : null}
        {message ? <div style={loginSuccess}>{message}</div> : null}

        <button type="submit" style={loginButton} disabled={loading}>{loading ? 'Gözlə...' : showReset ? 'Reset link göndər' : 'Daxil ol'}</button>
        <button type="button" style={linkButton} onClick={() => {
          setShowReset((value) => !value);
          setError('');
          setMessage('');
        }}>
          {showReset ? 'Girişə qayıt' : 'Şifrəni unutdum'}
        </button>
      </form>
    </main>
  );
}

function ResetPasswordScreen() {
  const token = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') || '' : '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Şifrələr eyni deyil.');
      return;
    }

    setLoading(true);
    try {
      const result = await authApi.resetPassword({ token, password });
      setMessage(result.message || 'Şifrə yeniləndi.');
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={loginPage}>
      <form style={loginCard} onSubmit={submit}>
        <img src="/akmedovs-logo.jpeg?v=20260720" alt="Akmedovs" style={loginLogo} />
        <div style={loginEyebrow}>Akmedovs</div>
        <h1 style={loginTitle}>Yeni şifrə</h1>
        <p style={loginSub}>Yeni şifrə minimum 8 simvol olmalıdır.</p>

        <label style={loginLabel}>
          Yeni şifrə
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} style={loginInput} autoComplete="new-password" autoFocus />
        </label>
        <label style={loginLabel}>
          Yeni şifrə təkrar
          <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} style={loginInput} autoComplete="new-password" />
        </label>

        {error ? <div style={loginError}>{error}</div> : null}
        {message ? <div style={loginSuccess}>{message}</div> : null}

        <button type="submit" style={loginButton} disabled={loading}>{loading ? 'Yenilənir...' : 'Şifrəni yenilə'}</button>
        <a href="/" style={{ ...linkButton, textAlign: 'center', textDecoration: 'none' }}>Girişə qayıt</a>
      </form>
    </main>
  );
}

function Shell({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  return (
    <div style={{ minHeight: '100vh', background: theme.colors.appBg }}>
      <header style={isMobile ? headerStyleMobile : headerStyle}>
        <Link to="/dashboard" style={brandWrap}>
          <img src="/akmedovs-logo.jpeg?v=20260720" alt="Akmedovs" style={brandLogo} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: theme.colors.text, letterSpacing: '0.01em' }}>Akmedovs</div>
            <div style={{ fontSize: '12px', color: theme.colors.muted }}>Kirayə və Aftoyuma Sistemi</div>
          </div>
        </Link>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menyu aç"
          style={menuButton}
        >
          <FiMenu size={21} />
        </button>
      </header>

      <SideMenu open={open} onClose={() => setOpen(false)} user={user} onLogout={onLogout} />

      <main style={isMobile ? mainStyleMobile : mainStyle}>
        <RouteBoundary>
          <AppRoutes />
        </RouteBoundary>
      </main>
    </div>
  );
}

class RouteBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('Route render error:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: '16px',
            borderRadius: theme.radius.md,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
          }}
        >
          Səhifə yüklənmədi: {this.state.error.message}
        </div>
      );
    }

    return this.props.children;
  }
}

function SideMenu({ open, onClose, user, onLogout }) {
  const location = useLocation();
  const isMobile = useIsMobile();

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: open ? 'rgba(15, 23, 42, 0.34)' : 'transparent',
          pointerEvents: open ? 'auto' : 'none',
          transition: 'background 180ms ease',
          zIndex: 19,
        }}
      />

      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: isMobile ? 'min(88vw, 320px)' : '280px',
          background: 'linear-gradient(180deg, rgba(255,253,249,0.98), rgba(248,243,234,0.98))',
          boxShadow: '0 22px 60px rgba(15, 23, 42, 0.12)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 220ms ease',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: `1px solid ${theme.colors.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 18px 12px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: theme.colors.text }}>Menyu</div>
            <div style={{ fontSize: '12px', color: theme.colors.muted }}>Səhifə seçimi</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Menyunu bağla" style={closeButton}>
            <FiX size={20} />
          </button>
        </div>

        <nav style={{ padding: '6px 12px 16px', display: 'grid', gap: '8px' }}>
          <MenuLink to="/dashboard" icon={<FiLayout />} active={location.pathname === '/' || location.pathname === '/dashboard'} onClick={onClose}>
            Dashboard
          </MenuLink>
          <MenuLink to="/kiraye" icon={<FiTable />} active={location.pathname === '/kiraye'} onClick={onClose} meta={['BI panel']}>
            Kirayələr
          </MenuLink>
          <MenuLink
            to="/aftoyuma"
            icon={<FiDroplet />}
            active={location.pathname === '/aftoyuma' || location.pathname === '/dashboard/aftoyuma'}
            onClick={onClose}
            meta={['Cars', 'Xərclər']}
          >
            Aftoyuma
          </MenuLink>
          <MenuLink to="/admin" icon={<FiEdit3 />} active={location.pathname === '/admin'} onClick={onClose} meta={['Form']}>
            Admin
          </MenuLink>
          <MenuLink to="/admin-panel" icon={<FiSettings />} active={location.pathname === '/admin-panel'} onClick={onClose} meta={['Settings']}>
            AdminPanel
          </MenuLink>
        </nav>
        <div style={{ marginTop: 'auto', padding: '12px', borderTop: `1px solid ${theme.colors.border}` }}>
          <div style={{ fontSize: '12px', color: theme.colors.muted, marginBottom: '8px' }}>
            Daxil olub: <strong>{user?.username || 'user'}</strong>
          </div>
          <button type="button" onClick={() => { onClose(); onLogout(); }} style={logoutButton}>Çıxış</button>
        </div>
      </aside>
    </>
  );
}

function MenuLink({ to, icon, children, active, onClick, meta = [] }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '13px 14px',
        borderRadius: theme.radius.md,
        textDecoration: 'none',
        color: active ? theme.colors.text : '#334155',
        background: active ? 'linear-gradient(180deg, rgba(15,118,110,0.08), rgba(15,118,110,0.04))' : 'transparent',
        border: '1px solid',
        borderColor: active ? 'rgba(15,118,110,0.14)' : 'transparent',
        fontWeight: 700,
        fontSize: '14px',
      }}
    >
      <span style={{ display: 'inline-flex', fontSize: '18px', color: active ? theme.colors.primaryDark : theme.colors.muted }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', lineHeight: 1.15 }}>{children}</span>
        {meta.length > 0 && (
          <span style={menuMetaRow}>
            {meta.map((item, index) => (
              <span key={`${item}-${index}`} style={menuMetaPill(active, index)}>
                {index === 0 && children === 'Kiraye' ? <FiStar size={10} /> : index === 0 && children === 'Aftoyuma' ? <FiPieChart size={10} /> : <FiTag size={10} />}
                <span>{item}</span>
              </span>
            ))}
          </span>
        )}
      </span>
    </Link>
  );
}

const AUTH_TOKEN_KEY = 'akmedovs-token';
const AUTH_USER_KEY = 'akmedovs-user';

function loadAuth() {
  if (typeof window === 'undefined') return { token: '', user: null };

  const token = localStorage.getItem(AUTH_TOKEN_KEY) || '';
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null');
  } catch {
    user = null;
  }

  return { token, user };
}

function saveAuth(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user || null));
  localStorage.removeItem('akmedovs-auth');
}

function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem('akmedovs-auth');
}

const loginPage = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: '18px',
  background: theme.colors.appBg,
};

const loginCard = {
  width: '100%',
  maxWidth: '390px',
  padding: '26px',
  borderRadius: '20px',
  background: theme.colors.surface,
  border: `1px solid ${theme.colors.border}`,
  boxShadow: theme.shadow,
  display: 'grid',
  gap: '14px',
  boxSizing: 'border-box',
};

const loginLogo = {
  width: '68px',
  height: '68px',
  borderRadius: '18px',
  objectFit: 'cover',
  border: `1px solid ${theme.colors.border}`,
  boxShadow: '0 14px 28px rgba(15, 23, 42, 0.10)',
};

const loginEyebrow = { fontSize: '12px', fontWeight: 900, color: theme.colors.primaryDark, letterSpacing: '0.12em', textTransform: 'uppercase' };
const loginTitle = { margin: 0, color: theme.colors.text, fontSize: '26px', lineHeight: 1.1 };
const loginSub = { margin: '-6px 0 4px', color: theme.colors.muted, fontSize: '13px', lineHeight: 1.5 };
const loginLabel = { display: 'grid', gap: '6px', color: theme.colors.muted, fontSize: '13px', fontWeight: 800 };
const loginInput = { width: '100%', padding: '13px 12px', borderRadius: '10px', border: `1px solid ${theme.colors.border}`, background: '#fff', color: theme.colors.text, fontSize: '15px', boxSizing: 'border-box' };
const loginError = { padding: '10px 12px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '13px', fontWeight: 700 };
const loginSuccess = { padding: '10px 12px', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #bbf7d0', color: '#166534', fontSize: '13px', fontWeight: 700 };
const loginButton = { padding: '14px', borderRadius: '12px', border: 'none', background: theme.colors.primary, color: '#fff', fontWeight: 900, fontSize: '15px', cursor: 'pointer' };
const linkButton = { border: 'none', background: 'transparent', color: theme.colors.primaryDark, fontWeight: 900, fontSize: '13px', cursor: 'pointer', padding: '4px' };

const headerStyle = {
  height: '64px',
  padding: '0 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: 'rgba(255,253,249,0.88)',
  backdropFilter: 'blur(18px)',
  borderBottom: `1px solid ${theme.colors.border}`,
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.04)',
  position: 'sticky',
  top: 0,
  zIndex: 10,
};

const headerStyleMobile = {
  ...headerStyle,
  height: '58px',
  padding: '0 12px',
};

const brandWrap = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  textDecoration: 'none',
  minWidth: 0,
};

const brandLogo = {
  width: '38px',
  height: '38px',
  borderRadius: '11px',
  objectFit: 'cover',
  display: 'block',
  border: `1px solid ${theme.colors.border}`,
  boxShadow: '0 10px 20px rgba(15, 23, 42, 0.08)',
};

const menuButton = {
  width: '42px',
  height: '42px',
  borderRadius: '12px',
  border: `1px solid ${theme.colors.border}`,
  background: 'linear-gradient(180deg, #ffffff, #faf7f2)',
  color: theme.colors.text,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
  boxShadow: '0 10px 20px rgba(15, 23, 42, 0.05)',
};

const mainStyle = { padding: '18px 16px 28px' };
const mainStyleMobile = { padding: '14px 12px 24px' };

const closeButton = {
  width: '38px',
  height: '38px',
  borderRadius: '12px',
  border: `1px solid ${theme.colors.border}`,
  background: 'linear-gradient(180deg, #ffffff, #faf7f2)',
  color: theme.colors.text,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
};

const logoutButton = {
  width: '100%',
  padding: '12px',
  borderRadius: '12px',
  border: `1px solid ${theme.colors.border}`,
  background: '#fff',
  color: theme.colors.text,
  fontWeight: 900,
  cursor: 'pointer',
};

const menuMetaRow = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
  marginTop: '6px',
};

const menuMetaPill = (active, index) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 7px',
  borderRadius: theme.radius.pill,
  border: `1px solid ${active ? 'rgba(15,118,110,0.14)' : theme.colors.border}`,
  background: active ? 'rgba(15,118,110,0.08)' : theme.colors.surfaceSoft,
  color: index === 0 ? theme.colors.primaryDark : theme.colors.muted,
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: 0,
  whiteSpace: 'nowrap',
});

export default App;

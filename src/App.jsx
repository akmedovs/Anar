import { BrowserRouter as Router, Link, useLocation } from 'react-router-dom';
import { FiSettings } from 'react-icons/fi';
import AppRoutes from './routes';
import { theme } from './constants/theme';

function App() {
  return (
    <Router>
      <Shell />
    </Router>
  );
}

function Shell() {
  const location = useLocation();
  const isAdmin = location.pathname === '/admin';

  return (
    <div style={page}>
      <header style={header}>
        <Link to="/" style={brand}>
          <span style={brandMark}>G</span>
          <span>
            <strong style={{ display: 'block' }}>Gloss Garage</strong>
            <small style={brandSub}>Sedan, cip, nano, polirovka, ximcistka</small>
          </span>
        </Link>

        <nav style={nav}>
          <a href="/#prices" style={navLink}>
            Qiymətlər
          </a>
          <a href="/#works" style={navLink}>
            İşlər
          </a>
          <Link to="/admin" style={isAdmin ? navLinkActive : navLink}>
            Admin
          </Link>
        </nav>

        <div style={headerActions}>
          <a href="/#prices" style={phoneButton}>
            Qiymətlər
          </a>
          <Link to="/admin" style={adminButton}>
            <FiSettings /> Panel
          </Link>
        </div>
      </header>

      <main style={main}>
        <AppRoutes />
      </main>
    </div>
  );
}

const page = {
  minHeight: '100vh',
};

const header = {
  position: 'sticky',
  top: 0,
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '16px 22px',
  backdropFilter: 'blur(18px)',
  background: 'rgba(4, 9, 18, 0.72)',
  borderBottom: `1px solid ${theme.colors.border}`,
};

const brand = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  color: theme.colors.text,
  textDecoration: 'none',
};

const brandMark = {
  width: 42,
  height: 42,
  borderRadius: '14px',
  display: 'grid',
  placeItems: 'center',
  fontWeight: 900,
  background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.wash})`,
  color: '#fff',
};

const brandSub = {
  display: 'block',
  color: theme.colors.muted,
  fontSize: 12,
  marginTop: 2,
};

const nav = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  justifyContent: 'center',
};

const navLink = {
  color: theme.colors.muted,
  textDecoration: 'none',
  fontWeight: 700,
  padding: '10px 14px',
  borderRadius: theme.radius.pill,
  border: `1px solid transparent`,
};

const navLinkActive = {
  ...navLink,
  color: theme.colors.text,
  border: `1px solid ${theme.colors.border}`,
  background: 'rgba(255,255,255,0.04)',
};

const headerActions = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
};

const phoneButton = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderRadius: theme.radius.pill,
  textDecoration: 'none',
  color: theme.colors.text,
  border: `1px solid ${theme.colors.border}`,
  background: 'rgba(255,255,255,0.04)',
};

const adminButton = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderRadius: theme.radius.pill,
  textDecoration: 'none',
  color: '#06111d',
  background: `linear-gradient(135deg, ${theme.colors.amber}, ${theme.colors.wash})`,
  fontWeight: 800,
};

const main = {
  paddingBottom: 40,
};

export default App;

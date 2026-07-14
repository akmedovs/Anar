// import { useState } from 'react'



// function App() {

//   return (
//     <>
  
//     </>
//   )
// }

// export default App
import { Component, useState } from 'react';
import { BrowserRouter as Router, Link, useLocation } from 'react-router-dom';
import { FiMenu, FiX, FiLayout, FiTable, FiDroplet, FiSettings, FiEdit3, FiStar, FiPieChart, FiTag } from 'react-icons/fi';
import AppRoutes from './routes';
import { theme } from './constants/theme';
import { useIsMobile } from './hooks/useIsMobile';

function App() {
  return (
    <Router>
      <Shell />
    </Router>
  );
}

function Shell() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  return (
    <div style={{ minHeight: '100vh', background: theme.colors.appBg }}>
      <header style={isMobile ? headerStyleMobile : headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={brandMark}>A</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: theme.colors.text }}>Anar</div>
            <div style={{ fontSize: '12px', color: theme.colors.muted }}>Kirayə və Aftoyuma Sistemi</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menyu aç"
          style={menuButton}
        >
          <FiMenu size={22} />
        </button>
      </header>

      <SideMenu open={open} onClose={() => setOpen(false)} />

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

function SideMenu({ open, onClose }) {
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
          background: theme.colors.surface,
          boxShadow: theme.shadow,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 220ms ease',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid #e2e8f0',
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
        background: active ? theme.colors.softPrimary : 'transparent',
        border: '1px solid',
        borderColor: active ? '#cdd9f7' : 'transparent',
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

const headerStyle = {
  height: '64px',
  padding: '0 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: 'rgba(255,255,255,0.92)',
  backdropFilter: 'blur(14px)',
  borderBottom: `1px solid ${theme.colors.border}`,
  position: 'sticky',
  top: 0,
  zIndex: 10,
};

const headerStyleMobile = {
  ...headerStyle,
  height: '58px',
  padding: '0 12px',
};

const brandMark = {
  width: '38px',
  height: '38px',
  borderRadius: '11px',
  background: `linear-gradient(135deg, ${theme.colors.primaryDark}, ${theme.colors.teal})`,
  color: '#ffffff',
  display: 'grid',
  placeItems: 'center',
  fontWeight: 800,
};

const menuButton = {
  width: '42px',
  height: '42px',
  borderRadius: '12px',
  border: `1px solid ${theme.colors.border}`,
  background: '#ffffff',
  color: theme.colors.text,
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
};

const mainStyle = { padding: '18px 16px 28px' };
const mainStyleMobile = { padding: '14px 12px 24px' };

const closeButton = {
  width: '38px',
  height: '38px',
  borderRadius: '12px',
  border: `1px solid ${theme.colors.border}`,
  background: '#ffffff',
  color: theme.colors.text,
  display: 'grid',
  placeItems: 'center',
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
  border: `1px solid ${active ? '#bfd0fb' : theme.colors.border}`,
  background: active ? '#f7faff' : theme.colors.surfaceSoft,
  color: index === 0 ? theme.colors.primaryDark : theme.colors.muted,
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: 0,
  whiteSpace: 'nowrap',
});

export default App;

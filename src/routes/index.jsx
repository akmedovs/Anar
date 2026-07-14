import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home/Home';
import Kiraye from '../pages/Kiraye/Kiraye';
import About from '../pages/About/About';
import DashboardAftoyuma from '../pages/Dashboard/Aftoyuma';
import AdminPanel from '../pages/AdminPanel/AdminPanel';
import Admin from '../pages/Admin/Admin.jsx';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dashboard" element={<Home />} />
      <Route path="/kiraye" element={<Kiraye />} />
      <Route path="/aftoyuma" element={<DashboardAftoyuma />} />
      <Route path="/dashboard/aftoyuma" element={<DashboardAftoyuma />} />
      <Route path="/about" element={<About />} />
      <Route path="/admin-panel" element={<AdminPanel />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}

export default AppRoutes;

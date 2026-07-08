import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home/Home';
import Kiraye from '../pages/Kiraye/Kiraye';
import About from '../pages/About/About';
import AdminPanel from '../pages/AdminPanel/AdminPanel';
import Admin from '../pages/Admin/AdminOnly';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/kiraye" element={<Kiraye />} />
      <Route path="/aftoyuma" element={<About />} />
      <Route path="/about" element={<About />} />
      <Route path="/admin-panel" element={<AdminPanel />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}

export default AppRoutes;

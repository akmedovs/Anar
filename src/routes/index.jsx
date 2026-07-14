import { Routes, Route } from 'react-router-dom';
import GlossGarageHome from '../pages/GlossGarage/Home';
import GlossGarageAdmin from '../pages/GlossGarage/Admin';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<GlossGarageHome />} />
      <Route path="/admin" element={<GlossGarageAdmin />} />
    </Routes>
  );
}

export default AppRoutes;

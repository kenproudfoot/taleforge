import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { HomePage } from './HomePage';

export function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}

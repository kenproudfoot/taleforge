import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { CampaignLibraryPage } from '@/ui/library/CampaignLibraryPage';
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
        <Route path="/library" element={<CampaignLibraryPage />} />
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}

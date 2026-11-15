import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { SettingsPage } from '@/ui/settings/SettingsPage';
import { SetupWizard } from '@/ui/settings/SetupWizard';
import { NewGamePage } from '@/ui/newgame/NewGamePage';
import { PlayPage } from '@/ui/table/PlayPage';
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
      <Route path="/play/:sessionId" element={<PlayPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/library" element={<CampaignLibraryPage />} />
        <Route path="/new" element={<NewGamePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/setup" element={<SetupWizard />} />
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}

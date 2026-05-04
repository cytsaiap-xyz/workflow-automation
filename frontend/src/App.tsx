import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './features/dashboard/DashboardPage';
import EditorPage from './features/editor/EditorPage';
import MonitoringPage from './features/monitoring/MonitoringPage';
import ExecutionsPage from './features/executions/ExecutionsPage';
import { AIProvidersPage } from './features/settings/AIProvidersPage';
import { PromptLibraryPage } from './features/settings/PromptLibraryPage';
import Sidebar from './shared/components/Sidebar';
import ToastContainer from './shared/components/ToastContainer';
import { ConfirmProvider } from './shared/components/ConfirmDialog';
import { InputProvider } from './shared/components/InputDialog';
import { useConfigStore } from './shared/stores/configStore';

// Layout with sidebar for main pages
function MainLayout({ children }: { children: React.ReactNode }) {
  return <Sidebar>{children}</Sidebar>;
}

function App() {
  useEffect(() => {
    useConfigStore.getState().load();
  }, []);

  return (
    <ConfirmProvider>
      <InputProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<MainLayout><DashboardPage /></MainLayout>} />
            <Route path="/monitoring" element={<MainLayout><MonitoringPage /></MainLayout>} />
            <Route path="/executions" element={<MainLayout><ExecutionsPage /></MainLayout>} />
            <Route path="/settings/ai-providers" element={<MainLayout><AIProvidersPage /></MainLayout>} />
            <Route path="/settings/prompt-templates" element={<MainLayout><PromptLibraryPage /></MainLayout>} />
            {/* Editor pages without sidebar for full-screen editing */}
            <Route path="/editor/:id" element={<EditorPage />} />
            <Route path="/editor" element={<EditorPage />} />
          </Routes>
        </BrowserRouter>
        <ToastContainer />
      </InputProvider>
    </ConfirmProvider>
  );
}

export default App;


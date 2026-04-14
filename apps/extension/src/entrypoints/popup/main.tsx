import React from 'react';
import ReactDOM from 'react-dom/client';
import { useAuth } from '@/lib/useAuth';
import { NotLoggedIn } from '@/components/NotLoggedIn';
import { NoCompany } from '@/components/NoCompany';
import { FullMode } from '@/components/FullMode';
import '@/assets/globals.css';

function Popup() {
  const {
    authState,
    loading,
    mode,
    login,
    loginWithApiKey,
    logout,
    setActiveCompany,
    setActiveProject,
  } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  switch (mode) {
    case 'not_logged_in':
      return <NotLoggedIn onLogin={login} onApiKeyLogin={loginWithApiKey} />;

    case 'no_company':
      return <NoCompany authState={authState!} onLogout={logout} />;

    case 'full':
      return (
        <FullMode
          authState={authState!}
          onLogout={logout}
          onSetActiveCompany={setActiveCompany}
          onSetActiveProject={setActiveProject}
        />
      );
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);

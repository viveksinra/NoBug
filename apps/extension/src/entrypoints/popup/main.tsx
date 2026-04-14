import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { useAuth } from '@/lib/useAuth';
import { hasConsent, giveConsent } from '@/lib/consent';
import { NotLoggedIn } from '@/components/NotLoggedIn';
import { NoCompany } from '@/components/NoCompany';
import { FullMode } from '@/components/FullMode';
import { ConsentDialog } from '@/components/ConsentDialog';
import '@/assets/globals.css';

function Popup() {
  const [consentGiven, setConsentGiven] = useState<boolean | null>(null);
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

  useEffect(() => {
    hasConsent().then(setConsentGiven);
  }, []);

  if (loading || consentGiven === null) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show consent dialog on first use (before any recording can happen)
  if (!consentGiven) {
    return (
      <ConsentDialog
        onAccept={async () => {
          await giveConsent();
          setConsentGiven(true);
        }}
        onDecline={() => {
          // Close popup — no recording will happen
          window.close();
        }}
      />
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

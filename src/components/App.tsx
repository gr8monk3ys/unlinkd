import { lazy, Suspense } from 'react';
import { BrandMark } from './BrandMark';
import { OnboardingWizard } from './OnboardingWizard';
import { UnlockScreen } from './UnlockScreen';
import { AUTO_LOCK_MINUTES, tabItems, useUnlinkdApp, type Tab } from './useUnlinkdApp';

const DashboardTab = lazy(() => import('./tabs/DashboardTab').then((m) => ({ default: m.DashboardTab })));
const PersonasTab = lazy(() => import('./tabs/PersonasTab').then((m) => ({ default: m.PersonasTab })));
const IdentifiersTab = lazy(() => import('./tabs/IdentifiersTab').then((m) => ({ default: m.IdentifiersTab })));
const AccountsTab = lazy(() => import('./tabs/AccountsTab').then((m) => ({ default: m.AccountsTab })));
const ConnectorsTab = lazy(() => import('./tabs/ConnectorsTab').then((m) => ({ default: m.ConnectorsTab })));
const FindingsTab = lazy(() => import('./tabs/FindingsTab').then((m) => ({ default: m.FindingsTab })));
const ReportTab = lazy(() => import('./tabs/ReportTab').then((m) => ({ default: m.ReportTab })));
const SettingsTab = lazy(() => import('./tabs/SettingsTab').then((m) => ({ default: m.SettingsTab })));
const BackupTab = lazy(() => import('./tabs/BackupTab').then((m) => ({ default: m.BackupTab })));

export function App(): React.JSX.Element {
  const app = useUnlinkdApp();
  const { tab, setTab, persona, vault } = app;

  function handleTabKeyDown(event: React.KeyboardEvent): void {
    const currentIndex = tabItems.findIndex((t) => t.id === tab);
    let nextIndex = -1;

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabItems.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabItems.length) % tabItems.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabItems.length - 1;
    }

    if (nextIndex >= 0) {
      event.preventDefault();
      const nextTab = tabItems[nextIndex]!.id as Tab;
      setTab(nextTab);
      document.getElementById(`tab-${nextTab}`)?.focus();
    }
  }

  if (!app.isUnlocked || !vault || !persona) {
    return (
      <UnlockScreen
        vaultPresent={app.vaultPresent}
        passphrase={app.passphrase}
        onPassphraseChange={app.setPassphrase}
        onUnlock={() => void app.handleUnlock()}
        onCreate={() => void app.handleCreateVault()}
        onWipeAndRecreate={() => void app.handleWipeAndRecreate()}
        error={app.error}
        auditError={app.auditError}
        notice={app.notice}
      />
    );
  }

  if (app.showOnboarding) {
    return (
      <main>
        <header className="app-header">
          <h1>
            <BrandMark />
            <span>
              unlink<span className="wordmark-d">d</span>
            </span>
          </h1>
          <span className="header-spacer" />
          <button type="button" onClick={app.handleCompleteOnboarding}>
            Skip setup
          </button>
        </header>
        {app.error ? <p role="alert">{app.error}</p> : null}
        <OnboardingWizard
          onAddIdentifiers={app.handleOnboardingAddIdentifiers}
          onImportAccounts={(file) => void app.handleImportAccounts(file)}
          onAddConnectors={app.handleOnboardingAddConnectors}
          onComplete={app.handleCompleteOnboarding}
          availableConnectorIds={new Set(app.connectorCatalog.map((def) => def.id))}
          accountsImportStatus={app.accountsImportStatus}
        />
      </main>
    );
  }

  return (
    <main>
      <a href="#tab-content" className="skip-link">Skip to content</a>
      <header className="app-header">
        <h1>
          <BrandMark />
          <span>
            unlink<span className="wordmark-d">d</span>
          </span>
        </h1>
        <span className="header-spacer" />
        <p className="persona-badge">{`Persona: ${persona.name}`}</p>
        <button
          type="button"
          onClick={app.handleLock}
          title="Clear the decrypted vault and passphrase from memory"
        >
          Lock
        </button>
      </header>
      <nav role="tablist" aria-label="Main navigation" onKeyDown={handleTabKeyDown}>
        {tabItems.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {app.busy ? <p role="status">Working…</p> : null}
      {app.notice ? <p role="status">{app.notice}</p> : null}
      {app.error ? <p role="alert">{app.error}</p> : null}

      <div id="tab-content">
      <Suspense fallback={<p>Loading...</p>}>
      {tab === 'dashboard' ? (
        <div role="tabpanel" id="tabpanel-dashboard" aria-labelledby="tab-dashboard">
        <DashboardTab
          personaIdentifiersCount={app.personaIdentifiers.length}
          personaAccountsCount={app.personaAccounts.length}
          connectorCatalog={app.connectorCatalog}
          dueConnectors={app.due}
          remindersSupported={app.remindersSupported}
          remindersEnabled={app.remindersEnabled}
          onEnableReminders={() => void app.handleEnableReminders()}
          auditCount={app.auditCount}
          auditError={app.auditError}
          onMarkRechecked={(id) => void app.handleMarkRechecked(id)}
          onRunLocalScan={() => void app.handleRunLocalScan()}
          onVerifyAudit={() => void app.handleVerifyAudit()}
          exposureNodes={app.exposureGraph.nodes}
          exposureEdges={app.exposureGraph.edges}
          connectorInstances={app.connectorInstances}
          findings={app.prioritizedFindings}
          personaName={persona.name}
          backupStatus={app.backupStatus}
          onGoToBackup={() => setTab('backup')}
          requestsNeedingAttention={app.requestsAttention}
          coverage={app.coverage}
          onGoToConnectors={() => setTab('connectors')}
        />
        </div>
      ) : null}

      {tab === 'personas' ? (
        <div role="tabpanel" id="tabpanel-personas" aria-labelledby="tab-personas">
        <PersonasTab
          personas={vault.personas}
          activePersonaId={vault.activePersonaId}
          onSetActivePersona={(id) => void app.handleSetActivePersona(id)}
          onAddPersona={(name) => void app.handleAddPersona(name)}
        />
        </div>
      ) : null}

      {tab === 'identifiers' ? (
        <div role="tabpanel" id="tabpanel-identifiers" aria-labelledby="tab-identifiers">
        <IdentifiersTab
          personaIdentifiers={app.personaIdentifiers}
          onAddIdentifier={app.handleAddIdentifier}
        />
        </div>
      ) : null}

      {tab === 'accounts' ? (
        <div role="tabpanel" id="tabpanel-accounts" aria-labelledby="tab-accounts">
        <AccountsTab
          personaAccounts={app.personaAccounts}
          accountsImportStatus={app.accountsImportStatus}
          onAddAccount={app.handleAddAccount}
          onImportAccounts={(file) => void app.handleImportAccounts(file)}
          onImportMailbox={(file) => void app.handleImportMailbox(file)}
        />
        </div>
      ) : null}

      {tab === 'connectors' ? (
        <div role="tabpanel" id="tabpanel-connectors" aria-labelledby="tab-connectors">
        <ConnectorsTab
          connectorCatalog={app.connectorCatalog}
          connectorCatalogMeta={app.connectorCatalogMeta}
          connectorInstances={app.connectorInstances}
          onUpdateCatalog={() => void app.handleUpdateConnectorCatalog()}
          onImportCatalog={(file) => void app.handleImportConnectorCatalog(file)}
          onImportAgentResults={(file) => void app.handleImportAgentResults(file)}
          onAddConnector={(def) => void app.handleAddConnector(def)}
          onExportAgentJob={(id) => void app.handleExportAgentJob(id)}
          onTransition={(id, to) => void app.handleTransition(id, to)}
          onAddNoteEvidence={app.handleAddNoteEvidence}
          onDeleteEvidence={(id, evidenceId) => void app.handleDeleteEvidence(id, evidenceId)}
          onUploadEvidence={app.handleUploadEvidence}
          onDownloadEvidence={(meta) => void app.handleDownloadEvidence(meta)}
          onRecordRequest={app.handleRecordRequest}
          onRecordResponse={app.handleRecordResponse}
        />
        </div>
      ) : null}

      {tab === 'findings' ? (
        <div role="tabpanel" id="tabpanel-findings" aria-labelledby="tab-findings">
        <FindingsTab
          findings={app.prioritizedFindings}
          onSetStatus={(id, status) => void app.handleSetFindingStatus(id, status)}
        />
        </div>
      ) : null}

      {tab === 'report' ? (
        <div role="tabpanel" id="tabpanel-report" aria-labelledby="tab-report">
        <ReportTab onExportReport={(redacted) => void app.handleExportReport(redacted)} />
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div role="tabpanel" id="tabpanel-settings" aria-labelledby="tab-settings">
        <SettingsTab
          hibpApiKey={vault.settings.hibpApiKey ?? ''}
          onSaveHibpApiKey={app.handleSaveHibpApiKey}
          onCheckPassword={app.handleCheckPassword}
          manualSuggestions={app.manualSuggestions}
        />
        </div>
      ) : null}

      {tab === 'backup' ? (
        <div role="tabpanel" id="tabpanel-backup" aria-labelledby="tab-backup">
        <BackupTab
          onExportBackup={() => void app.handleExportBackup()}
          onImportBackup={(file) => void app.handleImportBackup(file)}
          onWipeAllData={() => void app.handleWipeAllData()}
          backupStatus={app.backupStatus}
          storageHealth={app.storageHealth}
          legacyEvidenceCount={app.legacyEvidenceCount}
          onUpgradeLegacyEvidence={() => void app.handleUpgradeLegacyEvidence()}
        />
        </div>
      ) : null}
      </Suspense>
      </div>

      <footer className="app-footer">
        <span>Local-first</span>
        <span className="dot" />
        <span>Encrypted on your device</span>
        <span className="dot" />
        <span>{`Auto-locks after ${AUTO_LOCK_MINUTES} minutes of inactivity`}</span>
      </footer>
    </main>
  );
}

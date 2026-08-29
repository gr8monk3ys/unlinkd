import { useState } from 'react';
import { BACKUP_STALE_DAYS, formatBytes, type BackupFreshness, type StorageHealth } from '../../core/storage';

interface BackupTabProps {
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onWipeAllData: () => void;
  backupStatus: BackupFreshness;
  storageHealth: StorageHealth | null;
  legacyEvidenceCount: number;
  onUpgradeLegacyEvidence: () => void;
}

export function BackupTab({
  onExportBackup,
  onImportBackup,
  onWipeAllData,
  backupStatus,
  storageHealth,
  legacyEvidenceCount,
  onUpgradeLegacyEvidence
}: BackupTabProps): React.JSX.Element {
  const [confirmingWipe, setConfirmingWipe] = useState(false);

  return (
    <section>
      <h2>Backup</h2>
      <p>
        There is no passphrase recovery and no server-side copy. An exported backup is the only
        thing that survives a cleared browser profile, a reinstall, or a lost device.
      </p>

      {backupStatus.never ? (
        <p role="alert">
          You have never exported a backup. If this browser’s storage is cleared, everything in this
          vault is gone permanently.
        </p>
      ) : backupStatus.overdue ? (
        <p role="alert">
          {`Last backup was ${String(backupStatus.ageDays)} days ago. Export a fresh one — anything added since then is not covered.`}
        </p>
      ) : (
        <p role="status">
          {backupStatus.ageDays === 0
            ? 'Last backup: today.'
            : `Last backup: ${String(backupStatus.ageDays)} day(s) ago. Next reminder at ${String(BACKUP_STALE_DAYS)} days.`}
        </p>
      )}

      <button type="button" className="btn-primary" onClick={() => onExportBackup()}>
        Export Backup (Encrypted)
      </button>
      <label>
        Import Backup
        <input
          type="file"
          accept="application/json"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            // Reset so selecting the same file again re-fires the change event.
            event.target.value = '';
            if (file) {
              onImportBackup(file);
            }
          }}
        />
      </label>

      <h3>Storage health</h3>
      {storageHealth === null ? (
        <p>Checking storage…</p>
      ) : !storageHealth.supported ? (
        <p>
          This browser does not report storage persistence. Treat local data as evictable and export
          backups regularly.
        </p>
      ) : (
        <>
          <p>
            {storageHealth.persisted
              ? 'Persistent storage: granted — the browser will not evict this vault automatically.'
              : 'Persistent storage: not granted. The browser may clear this vault under disk pressure.'}
          </p>
          {storageHealth.usageBytes !== null && storageHealth.quotaBytes !== null ? (
            <p>{`Using ${formatBytes(storageHealth.usageBytes)} of about ${formatBytes(storageHealth.quotaBytes)} available.`}</p>
          ) : null}
          {!storageHealth.persisted ? (
            <p>
              Browsers usually grant this once a site is bookmarked or used regularly. Until then,
              exported backups are your only durable copy.
            </p>
          ) : null}
        </>
      )}

      {legacyEvidenceCount > 0 ? (
        <>
          <h3>Encryption upgrade</h3>
          <p role="alert">
            {`${String(legacyEvidenceCount)} evidence file(s) are still encrypted with an older key derivation. Re-encrypt them under the current memory-hard KDF.`}
          </p>
          <button type="button" onClick={() => onUpgradeLegacyEvidence()}>
            Re-encrypt Legacy Evidence
          </button>
        </>
      ) : null}

      <h3>Danger zone</h3>
      {confirmingWipe ? (
        <div role="region" aria-label="Confirm wipe">
          <p role="alert">
            This permanently destroys the vault, audit log, and all evidence on this device. There
            is no undo and no recovery without a backup.
          </p>
          <button type="button" className="btn-danger" onClick={() => onWipeAllData()}>
            Yes, permanently wipe everything
          </button>
          <button type="button" onClick={() => setConfirmingWipe(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="btn-danger" onClick={() => setConfirmingWipe(true)}>
          Wipe All Local Data
        </button>
      )}
    </section>
  );
}

import { useState } from 'react';

interface BackupTabProps {
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onWipeAllData: () => void;
}

export function BackupTab({ onExportBackup, onImportBackup, onWipeAllData }: BackupTabProps): React.JSX.Element {
  const [confirmingWipe, setConfirmingWipe] = useState(false);

  return (
    <section>
      <h2>Backup</h2>
      <p>
        Browser storage can be cleared by a reinstall, OS reset, or storage eviction — export an
        encrypted backup regularly. The backup stays encrypted with your passphrase.
      </p>
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

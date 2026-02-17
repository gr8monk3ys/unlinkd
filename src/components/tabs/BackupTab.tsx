interface BackupTabProps {
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onWipeAllData: () => void;
}

export function BackupTab({ onExportBackup, onImportBackup, onWipeAllData }: BackupTabProps): React.JSX.Element {
  return (
    <section>
      <h2>Backup</h2>
      <button type="button" onClick={() => onExportBackup()}>
        Export Backup (Encrypted)
      </button>
      <label>
        Import Backup
        <input
          type="file"
          accept="application/json"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            if (file) {
              onImportBackup(file);
            }
          }}
        />
      </label>
      <button type="button" onClick={() => onWipeAllData()}>
        Wipe All Local Data
      </button>
    </section>
  );
}

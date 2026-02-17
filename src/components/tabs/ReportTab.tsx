interface ReportTabProps {
  onExportReport: (redacted: boolean) => void;
}

export function ReportTab({ onExportReport }: ReportTabProps): React.JSX.Element {
  return (
    <section>
      <h2>Report</h2>
      <button type="button" onClick={() => onExportReport(true)}>
        Export Redacted Markdown
      </button>
      <button type="button" onClick={() => onExportReport(false)}>
        Export Full Markdown (Sensitive)
      </button>
    </section>
  );
}

export interface AppConfig {
  maxIdentifiers: number;
  retentionDays: number;
}

const defaultConfig: AppConfig = {
  maxIdentifiers: 250,
  retentionDays: 90
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAppConfig(): AppConfig {
  return {
    maxIdentifiers: parsePositiveInt(import.meta.env.VITE_MAX_IDENTIFIERS, defaultConfig.maxIdentifiers),
    retentionDays: parsePositiveInt(import.meta.env.VITE_IDENTIFIER_RETENTION_DAYS, defaultConfig.retentionDays)
  };
}

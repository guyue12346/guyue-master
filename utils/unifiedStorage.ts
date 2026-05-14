type ElectronLikeStorage = {
  saveAppData?: (key: string, data: any) => Promise<boolean>;
  loadAppData?: (key: string) => Promise<any>;
};

type JsonNormalizer<T> = (value: any) => T;
type JsonRecovery<T> = (current: T, candidates: T[]) => T;

interface UnifiedJsonOptions<T> {
  appDataKey: string;
  localStorageKey: string;
  defaultValue: () => T;
  normalize?: JsonNormalizer<T>;
  recover?: JsonRecovery<T>;
  localStorageMode?: 'json' | 'raw-string';
}

interface UnifiedJsonEnvelope<T> {
  __guyueUnifiedStorage: 1;
  appDataKey: string;
  localStorageKey: string;
  schemaVersion: 1;
  updatedAt: number;
  source: 'localStorage-migration' | 'app-write' | 'snapshot-restore';
  data: T;
}

const SNAPSHOT_MARKER_KEY = 'guyue_unified_storage_snapshot_v1';

const getElectronStorage = (): ElectronLikeStorage | null => {
  if (typeof window === 'undefined') return null;
  return (window as any).electronAPI || null;
};

const normalizeAppDataKey = (key: string) =>
  key
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'unnamed';

const unwrapEnvelope = <T>(value: any): T => {
  if (value && typeof value === 'object' && value.__guyueUnifiedStorage === 1 && 'data' in value) {
    return value.data as T;
  }
  return value as T;
};

const wrapEnvelope = <T>(
  options: UnifiedJsonOptions<T>,
  data: T,
  source: UnifiedJsonEnvelope<T>['source'],
): UnifiedJsonEnvelope<T> => ({
  __guyueUnifiedStorage: 1,
  appDataKey: options.appDataKey,
  localStorageKey: options.localStorageKey,
  schemaVersion: 1,
  updatedAt: Date.now(),
  source,
  data,
});

const applyNormalizer = <T>(options: UnifiedJsonOptions<T>, value: any): T => {
  const raw = unwrapEnvelope<T>(value);
  return options.normalize ? options.normalize(raw) : raw;
};

const areJsonEqual = (a: any, b: any) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
};

const parseStoredValue = (value: string | null) => {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const getSnapshotCandidate = (snapshot: any, localStorageKey: string) => {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.items)) return null;
  const entry = snapshot.items.find((item: any) => item?.key === localStorageKey);
  if (!entry) return null;
  return parseStoredValue(entry.value ?? null);
};

const collectRecoveryCandidates = async <T>(
  options: UnifiedJsonOptions<T>,
  safeAppDataKey: string,
  electron: Required<ElectronLikeStorage>,
): Promise<T[]> => {
  const rawCandidates: any[] = [];
  const candidateKeys = [
    `${safeAppDataKey}-legacy-localStorage-copy`,
    `${safeAppDataKey}-initial-localStorage-copy`,
  ];

  for (const candidateKey of candidateKeys) {
    try {
      const candidate = await electron.loadAppData(candidateKey);
      if (candidate !== null && candidate !== undefined) {
        rawCandidates.push(candidate);
      }
    } catch {
      // Recovery sources are best-effort.
    }
  }

  try {
    const snapshot = await electron.loadAppData('storage-localStorage-snapshot-latest');
    const snapshotCandidate = getSnapshotCandidate(snapshot, options.localStorageKey);
    if (snapshotCandidate !== null && snapshotCandidate !== undefined) {
      rawCandidates.push(snapshotCandidate);
    }
  } catch {
    // Recovery sources are best-effort.
  }

  const candidates: T[] = [];
  const seen = new Set<string>();
  rawCandidates.forEach(candidate => {
    try {
      const normalized = applyNormalizer(options, candidate);
      const signature = JSON.stringify(normalized);
      if (!seen.has(signature)) {
        seen.add(signature);
        candidates.push(normalized);
      }
    } catch {
      // Ignore malformed recovery data.
    }
  });

  return candidates;
};

const recoverUnifiedData = async <T>(
  options: UnifiedJsonOptions<T>,
  safeAppDataKey: string,
  electron: Required<ElectronLikeStorage>,
  current: T,
) => {
  if (!options.recover) return current;
  const candidates = await collectRecoveryCandidates(options, safeAppDataKey, electron);
  if (candidates.length === 0) return current;
  return options.recover(current, candidates);
};

export const hasUnifiedFileStorage = () => {
  const electron = getElectronStorage();
  return Boolean(electron?.saveAppData && electron?.loadAppData);
};

export const loadLocalJson = <T>(options: Omit<UnifiedJsonOptions<T>, 'appDataKey'>): T => {
  if (typeof localStorage === 'undefined') return options.defaultValue();
  try {
    const raw = localStorage.getItem(options.localStorageKey);
    if (!raw) return options.defaultValue();
    let parsed: any = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
    return options.normalize ? options.normalize(parsed) : parsed;
  } catch {
    return options.defaultValue();
  }
};

export const saveLocalJson = <T>(localStorageKey: string, data: T) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(localStorageKey, JSON.stringify(data));
};

const saveLocalValue = <T>(options: UnifiedJsonOptions<T>, data: T) => {
  if (typeof localStorage === 'undefined') return;
  if (options.localStorageMode === 'raw-string') {
    localStorage.setItem(options.localStorageKey, String(data ?? ''));
    return;
  }
  saveLocalJson(options.localStorageKey, data);
};

export const loadUnifiedJson = async <T>(options: UnifiedJsonOptions<T>): Promise<T> => {
  const electron = getElectronStorage();
  const safeAppDataKey = normalizeAppDataKey(options.appDataKey);
  const localRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(options.localStorageKey) : null;

  if (electron?.loadAppData && electron?.saveAppData) {
    const fileValue = await electron.loadAppData(safeAppDataKey);
    if (fileValue !== null && fileValue !== undefined) {
      const normalized = applyNormalizer(options, fileValue);
      if (localRaw) {
        try {
          const legacyData = options.normalize ? options.normalize(JSON.parse(localRaw)) : JSON.parse(localRaw);
          if (JSON.stringify(legacyData) !== JSON.stringify(normalized)) {
            await electron.saveAppData(
              `${safeAppDataKey}-legacy-localStorage-copy`,
              wrapEnvelope(options, legacyData, 'localStorage-migration'),
            );
          }
        } catch {
          await electron.saveAppData(`${safeAppDataKey}-legacy-localStorage-raw`, {
            localStorageKey: options.localStorageKey,
            capturedAt: Date.now(),
            raw: localRaw,
          });
        }
      }
      const recovered = await recoverUnifiedData(
        options,
        safeAppDataKey,
        electron as Required<ElectronLikeStorage>,
        normalized,
      );
      if (!areJsonEqual(recovered, normalized)) {
        await electron.saveAppData(
          `${safeAppDataKey}-pre-recovery-copy`,
          wrapEnvelope(options, normalized, 'snapshot-restore'),
        );
        await electron.saveAppData(safeAppDataKey, wrapEnvelope(options, recovered, 'snapshot-restore'));
        try {
          saveLocalValue(options, recovered);
        } catch {
          // localStorage backup is best-effort.
        }
        return recovered;
      }
      try {
        saveLocalValue(options, normalized);
      } catch {
        // localStorage backup is best-effort.
      }
      return normalized;
    }

    if (localRaw) {
      try {
        let parsed: any = localRaw;
        try {
          parsed = JSON.parse(localRaw);
        } catch {
          parsed = localRaw;
        }
        const migrated = options.normalize ? options.normalize(parsed) : parsed;
        await electron.saveAppData(safeAppDataKey, wrapEnvelope(options, migrated, 'localStorage-migration'));
        await electron.saveAppData(`${safeAppDataKey}-initial-localStorage-copy`, wrapEnvelope(options, migrated, 'localStorage-migration'));
        return migrated;
      } catch {
        return options.defaultValue();
      }
    }

    const recovered = await recoverUnifiedData(
      options,
      safeAppDataKey,
      electron as Required<ElectronLikeStorage>,
      options.defaultValue(),
    );
    if (!areJsonEqual(recovered, options.defaultValue())) {
      await electron.saveAppData(safeAppDataKey, wrapEnvelope(options, recovered, 'snapshot-restore'));
      try {
        saveLocalValue(options, recovered);
      } catch {
        // localStorage backup is best-effort.
      }
      return recovered;
    }
  }

  return loadLocalJson(options);
};

export const saveUnifiedJson = <T>(options: UnifiedJsonOptions<T>, data: T) => {
  saveLocalValue(options, data);

  const electron = getElectronStorage();
  if (!electron?.saveAppData) return;

  const safeAppDataKey = normalizeAppDataKey(options.appDataKey);
  void electron.saveAppData(safeAppDataKey, wrapEnvelope(options, data, 'app-write'));
};

export const appDataMirrorKeyForLocalStorageKey = (localStorageKey: string) =>
  `localStorage-${normalizeAppDataKey(localStorageKey)}`;

export const saveLocalStorageMirror = <T>(localStorageKey: string, data: T) => {
  saveUnifiedJson(
    {
      appDataKey: appDataMirrorKeyForLocalStorageKey(localStorageKey),
      localStorageKey,
      defaultValue: () => data,
      localStorageMode: typeof data === 'string' ? 'raw-string' : 'json',
    },
    data,
  );
};

export const ensureLocalStorageSafetySnapshot = async (reason: string) => {
  if (typeof localStorage === 'undefined') return false;

  const electron = getElectronStorage();
  if (!electron?.saveAppData) return false;

  const existingMarker = localStorage.getItem(SNAPSHOT_MARKER_KEY);
  if (existingMarker) return false;

  const createdAt = Date.now();
  const items = Object.keys(localStorage)
    .sort()
    .map(key => ({
      key,
      value: localStorage.getItem(key),
    }));

  const snapshot = {
    version: 1,
    reason,
    createdAt,
    itemCount: items.length,
    items,
  };

  const latestSaved = await electron.saveAppData('storage-localStorage-snapshot-latest', snapshot);
  const timestampSaved = await electron.saveAppData(`storage-localStorage-snapshot-${createdAt}`, snapshot);

  if (latestSaved || timestampSaved) {
    localStorage.setItem(SNAPSHOT_MARKER_KEY, String(createdAt));
    return true;
  }

  return false;
};

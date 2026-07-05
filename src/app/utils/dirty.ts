import { binToBytes } from '@app/utils/blob_utils';

const bytesEqual = (a: Uint8Array | null, b: Uint8Array | null): boolean => {
  if (a === null || b === null) {
    return a === b;
  }
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

const dateTime = (value: unknown): number | null => {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
  }
  return null;
};

const numericField = (key: string): boolean => /_(?:u|i)(?:32|64)$/.test(key);

const numericValue = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
};

export const dirtyValueEqual = (key: string, a: unknown, b: unknown): boolean => {
  if (key.endsWith('_bin')) {
    return bytesEqual(binToBytes(a), binToBytes(b));
  }
  if (key.endsWith('_dt')) {
    const aTime = dateTime(a);
    const bTime = dateTime(b);
    if (aTime !== null || bTime !== null) {
      return aTime === bTime;
    }
  }
  if (numericField(key)) {
    const aNumber = numericValue(a);
    const bNumber = numericValue(b);
    if (aNumber !== null || bNumber !== null) {
      return aNumber === bNumber;
    }
  }
  return Object.is(a, b);
};

export const recordChanged = (
  original: Record<string, unknown> | null,
  current: Record<string, unknown> | null,
  extraDirty = false,
): boolean => {
  if (extraDirty) {
    return true;
  }
  if (!original || !current) {
    return false;
  }
  const keys = new Set([...Object.keys(original), ...Object.keys(current)]);
  let changed = false;
  keys.forEach((key) => {
    if (!dirtyValueEqual(key, original[key], current[key])) {
      changed = true;
    }
  });
  return changed;
};

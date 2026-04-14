/**
 * Utility functions for safe number parsing and validation
 */

export function safeParseFloat(value: string | number | undefined | null, defaultValue: number = 0): number {
  if (typeof value === 'number') {
    return value;
  }
  
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  
  const parsed = parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return isNaN(parsed) ? defaultValue : parsed;
}

export function isValidAmount(value: string | number | undefined | null): boolean {
  if (typeof value === 'number') {
    return value >= 0;
  }
  
  if (value === null || value === undefined || value === '') {
    return false;
  }
  
  const parsed = parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return !isNaN(parsed) && parsed >= 0;
}

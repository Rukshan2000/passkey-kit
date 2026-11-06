import { PasskeyError } from './errors.js';

export function fail(message: string): never {
  throw new PasskeyError('INVALID_INPUT', message);
}

export function assertString(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) fail(`${name} must be a non-empty string (max ${max})`);
  return value;
}

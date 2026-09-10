import { type AppError, dbError, messageOf } from '../errors/app-error';

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Resultado explícito. Ninguna operación de datos lanza: devuelve esto. */
export type Result<T, E = AppError> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return !r.ok;
}

export function map<T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

export function mapError<T, E, F>(r: Result<T, E>, f: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(f(r.error));
}

export function andThen<T, U, E>(r: Result<T, E>, f: (value: T) => Result<U, E>): Result<U, E> {
  return r.ok ? f(r.value) : r;
}

export async function andThenAsync<T, U, E>(
  r: Result<T, E>,
  f: (value: T) => Promise<Result<U, E>>,
): Promise<Result<U, E>> {
  return r.ok ? f(r.value) : r;
}

export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/** Combina varios resultados; el primer error gana. */
export function all<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
}

/**
 * Frontera con código que lanza (Tauri, librerías). Convierte la excepción
 * en `AppError` y nunca la deja escapar.
 */
export async function tryCatch<T>(
  f: () => Promise<T>,
  toError: (cause: unknown) => AppError = (cause) => dbError(messageOf(cause), cause),
): Promise<Result<T>> {
  try {
    return ok(await f());
  } catch (cause) {
    return err(toError(cause));
  }
}

export function tryCatchSync<T>(
  f: () => T,
  toError: (cause: unknown) => AppError = (cause) => dbError(messageOf(cause), cause),
): Result<T> {
  try {
    return ok(f());
  } catch (cause) {
    return err(toError(cause));
  }
}

/**
 * Error de aplicación discriminado. Nunca cruza capas como excepción:
 * viaja dentro de `Result<T, AppError>`.
 */
export type AppError =
  | { readonly kind: 'db'; readonly message: string; readonly cause?: unknown }
  | { readonly kind: 'validation'; readonly field: string; readonly message: string }
  | { readonly kind: 'not_found'; readonly entity: string; readonly id: string }
  | {
      readonly kind: 'ollama';
      readonly reason: 'not_detected' | 'model_missing' | 'timeout' | 'invalid_json' | 'http';
      readonly message: string;
    }
  | { readonly kind: 'export'; readonly message: string }
  | { readonly kind: 'fs'; readonly message: string; readonly cause?: unknown }
  | { readonly kind: 'not_ready'; readonly message: string };

export type ValidationError = Extract<AppError, { kind: 'validation' }>;

export function dbError(message: string, cause?: unknown): AppError {
  return { kind: 'db', message, cause };
}

export function fsError(message: string, cause?: unknown): AppError {
  return { kind: 'fs', message, cause };
}

export function validationError(field: string, message: string): ValidationError {
  return { kind: 'validation', field, message };
}

export function notFound(entity: string, id: string): AppError {
  return { kind: 'not_found', entity, id };
}

export function notReady(message = 'La base de datos todavía no está abierta.'): AppError {
  return { kind: 'not_ready', message };
}

/** Texto legible de cualquier valor lanzado (Error, string, objeto de Tauri…). */
export function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  if (cause && typeof cause === 'object' && 'message' in cause) {
    const m = (cause as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}

/** Mensaje para mostrar en la UI. */
export function describeError(error: AppError): string {
  switch (error.kind) {
    case 'validation':
    case 'db':
    case 'fs':
    case 'export':
    case 'ollama':
    case 'not_ready':
      return error.message;
    case 'not_found':
      return `No se encuentra ${error.entity} ${error.id}.`;
  }
}

import { v7 } from 'uuid';

/** UUID v7: ordenable por tiempo, identificador de todas las filas nuevas. */
export function uuidV7(): string {
  return v7();
}

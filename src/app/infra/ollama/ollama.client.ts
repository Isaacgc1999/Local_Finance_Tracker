import { type AppError, messageOf } from '../../core/errors/app-error';
import { type Result, err, ok } from '../../core/types/result';
import type { ChatMessage } from '../../domain/ai/prompt';
import { isTauri } from '../fs/db-location';

/**
 * Cliente de Ollama. Dentro de Tauri usa `plugin-http` (petición desde Rust:
 * sin CORS y con el scope limitado a localhost:11434 en las capabilities);
 * fuera, el `fetch` del navegador para poder probar en el modo demo.
 *
 * Es la ÚNICA salida de red de toda la aplicación.
 */

export interface OllamaStats {
  readonly latencyMs: number;
}

export interface ChatRequest {
  readonly endpoint: string;
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  /** JSON Schema para forzar la salida (structured outputs). */
  readonly schema: Record<string, unknown>;
  /** Silencio maximo ENTRE fragmentos, una vez el modelo ya escribe. */
  readonly timeoutMs: number;
  /** Silencio maximo ANTES del primer fragmento: carga del modelo + prompt. */
  readonly firstChunkMs: number;
  /** Tope absoluto de la generacion, por si el modelo entra en bucle. */
  readonly maxMs: number;
  /** Parámetros del modelo (`options`, `keep_alive`): los decide el dominio. */
  readonly requestOptions: {
    readonly options: Readonly<Record<string, number>>;
    readonly keep_alive: string;
  };
  readonly signal?: AbortSignal;
  /** Progreso del streaming: texto acumulado y nº de fragmentos recibidos. */
  readonly onToken?: (partial: string, chunks: number) => void;
}

export interface ChatResult {
  readonly text: string;
  readonly durationMs: number;
  readonly evalCount: number | null;
}

interface ChatChunk {
  readonly message?: { readonly content?: string };
  readonly done?: boolean;
  readonly done_reason?: string;
  readonly eval_count?: number;
  readonly error?: string;
}

interface TagsResponse {
  readonly models?: readonly { readonly name?: string; readonly model?: string }[];
}

function ollamaError(reason: Extract<AppError, { kind: 'ollama' }>['reason'], message: string): AppError {
  return { kind: 'ollama', reason, message };
}

/** `http://127.0.0.1:11434` sin barra final. */
export function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  return trimmed.startsWith('http') ? trimmed : `http://${trimmed}`;
}

async function httpFetch(input: string, init: RequestInit & { connectTimeout?: number }): Promise<Response> {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    // El plugin añade `Origin: http://tauri.localhost` a toda petición, y
    // Ollama solo acepta por defecto orígenes de localhost: responde 403.
    // Con la feature `unsafe-headers` del plugin, un Origin vacío hace que
    // la cabecera se elimine (una petición de servidor a servidor no la
    // necesita). Así funciona con cualquier Ollama sin tocar OLLAMA_ORIGINS.
    const headers = new Headers(init.headers);
    headers.set('Origin', '');
    return tauriFetch(input, { ...init, headers });
  }
  return fetch(input, init);
}

export class OllamaClient {
  /** ¿Responde el servicio? Devuelve la latencia para la pill de Ajustes. */
  async ping(endpoint: string, timeoutMs = 4000): Promise<Result<OllamaStats>> {
    const url = normalizeEndpoint(endpoint);
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await httpFetch(`${url}/api/version`, { method: 'GET', signal: controller.signal, connectTimeout: timeoutMs });
      if (!res.ok) return err(ollamaError('http', `Ollama respondió ${res.status}.`));
      return ok({ latencyMs: Date.now() - started });
    } catch (cause) {
      return err(ollamaError('not_detected', `No se encuentra Ollama en ${url.replace(/^https?:\/\//, '')}: ${messageOf(cause)}`));
    } finally {
      clearTimeout(timer);
    }
  }

  /** Modelos descargados en la máquina. */
  async listModels(endpoint: string, timeoutMs = 5000): Promise<Result<readonly string[]>> {
    const url = normalizeEndpoint(endpoint);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await httpFetch(`${url}/api/tags`, { method: 'GET', signal: controller.signal, connectTimeout: timeoutMs });
      if (!res.ok) return err(ollamaError('http', `Ollama respondió ${res.status} al listar modelos.`));
      const body = (await res.json()) as TagsResponse;
      const names = (body.models ?? []).map((m) => m.model ?? m.name ?? '').filter((n) => n.length > 0);
      return ok(names);
    } catch (cause) {
      return err(ollamaError('not_detected', messageOf(cause)));
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Carga el modelo en memoria sin generar nada (`/api/generate` sin prompt),
   * para que el primer informe no pague los ~11 s de carga en frío. Si falla
   * no pasa nada: el informe lo cargará igualmente.
   */
  async warmUp(endpoint: string, model: string, keepAlive: string): Promise<void> {
    const url = normalizeEndpoint(endpoint);
    try {
      await httpFetch(`${url}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, keep_alive: keepAlive }),
        connectTimeout: 5000,
      });
    } catch {
      /* sin consecuencias: es solo una optimización */
    }
  }

  /**
   * `POST /api/chat` con `stream: true`: cada línea es un JSON con un
   * fragmento. Se acumula el contenido y se informa del progreso.
   */
  async chat(request: ChatRequest): Promise<Result<ChatResult>> {
    const url = normalizeEndpoint(request.endpoint);
    const started = Date.now();
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal?.addEventListener('abort', abort);

    /**
     * El límite es de **inactividad**, no de duración total: un modelo local
     * escribe a unos pocos tokens por segundo y un informe completo puede
     * tardar minutos. Cortar mientras escribe convertiría cualquier
     * generación sana en un error, así que el reloj se reinicia con cada
     * fragmento que llega.
     *
     * La primera espera es mucho más larga que las siguientes: antes del
     * primer token Ollama tiene que cargar el modelo en memoria (unos 10 s
     * en frío) y procesar el prompt entero, que en CPU pasa del minuto. Ese
     * silencio inicial es normal; el de mitad de la generación no.
     */
    let firstChunk = true;
    let timer = setTimeout(abort, request.firstChunkMs);
    const keepAlive = () => {
      clearTimeout(timer);
      timer = setTimeout(abort, firstChunk ? request.firstChunkMs : request.timeoutMs);
    };
    let stalled = false;

    try {
      const res = await httpFetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        connectTimeout: 10_000,
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          stream: true,
          format: request.schema,
          ...request.requestOptions,
        }),
      });

      if (res.status === 404) {
        return err(ollamaError('model_missing', `El modelo «${request.model}» no está descargado. Ejecuta: ollama pull ${request.model}`));
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        return err(ollamaError('http', `Ollama respondió ${res.status}. ${detail.slice(0, 200)}`));
      }
      if (!res.body) return err(ollamaError('http', 'Ollama no devolvió cuerpo de respuesta.'));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      let chunks = 0;
      let evalCount: number | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        keepAlive();
        firstChunk = false;
        if (Date.now() - started > request.maxMs) {
          stalled = true;
          abort();
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf('\n');
          if (!line) continue;
          let chunk: ChatChunk;
          try {
            chunk = JSON.parse(line) as ChatChunk;
          } catch {
            continue; // línea partida o ruido: se ignora
          }
          if (chunk.error) {
            const missing = /not found|pull/i.test(chunk.error);
            return err(ollamaError(missing ? 'model_missing' : 'http', chunk.error));
          }
          const piece = chunk.message?.content ?? '';
          if (piece) {
            text += piece;
            chunks++;
            request.onToken?.(text, chunks);
          }
          if (chunk.done) {
            evalCount = chunk.eval_count ?? null;
          }
        }
      }

      if (stalled) {
        return err(ollamaError('timeout', `El informe superó los ${Math.round(request.maxMs / 60_000)} min y se ha cancelado.`));
      }
      if (!text.trim()) return err(ollamaError('invalid_json', 'Ollama devolvió una respuesta vacía.'));
      return ok({ text, durationMs: Date.now() - started, evalCount });
    } catch (cause) {
      const aborted = controller.signal.aborted;
      const seconds = Math.round(request.timeoutMs / 1000);
      return err(
        aborted
          ? ollamaError('timeout', `Ollama dejó de enviar texto durante ${seconds} s y se ha cancelado.`)
          : ollamaError('not_detected', `No se pudo hablar con Ollama: ${messageOf(cause)}`),
      );
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', abort);
    }
  }
}

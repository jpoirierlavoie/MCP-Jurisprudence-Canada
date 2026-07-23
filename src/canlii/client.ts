/**
 * Client sortant vers l'API REST de CanLII (spécification §5).
 *
 * Le quota de CanLII n'est PAS publié (§16.2). Le comportement par défaut est donc
 * délibérément prudent : séquentiel, étranglé, réessayé avec temporisation, plafonné
 * en dur. Un utilisateur unique n'a rien à gagner d'un pic de concurrence, et un pic
 * peut coûter la clef.
 *
 * Le client est instancié UNE FOIS PAR INVOCATION D'OUTIL et porte son propre
 * compteur, afin que CANLII_MAX_CALLS_PER_INVOCATION soit un plafond réel et non
 * un plafond global qu'une invocation longue épuiserait pour les suivantes.
 */

import {
  CanliiBudgetError,
  CanliiError,
  CanliiTimeoutError,
  redactUrl,
  truncateBody,
} from "./errors";
import type { CanliiErrorBody } from "./types";

/** HTTPS uniquement — le HTTP n'est plus pris en charge par l'API. */
const BASE = "https://api.canlii.org/v1";

/** Statuts qui valent un réessai (§5.2). Tout le reste échoue immédiatement. */
const RETRIABLE = new Set([429, 500, 502, 503, 504]);

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;
const JITTER_MS = 200;

export interface CanliiUsage {
  calls: number;
  errors: number;
  throttled: number;
}

export interface CanliiClient {
  get<T>(path: string, params?: Record<string, string | number>): Promise<T>;
  callsMade(): number;
  /** Appels encore permis dans cette invocation. */
  remaining(): number;
  /** Compteurs à verser dans `api_usage` en fin d'invocation (§10). */
  usage(): CanliiUsage;
}

export interface ClientConfig {
  apiKey: string;
  minIntervalMs: number;
  maxCalls: number;
  timeoutMs: number;
}

/** Coutures de test : injectables, jamais employées en production. */
export interface ClientSeams {
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  jitterImpl?: () => number;
}

function readInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Construit la configuration à partir des variables du Worker. */
export function configFromEnv(env: Env): ClientConfig {
  return {
    apiKey: env.CANLII_API_KEY ?? "",
    minIntervalMs: readInt(env.CANLII_MIN_INTERVAL_MS, 250),
    maxCalls: readInt(env.CANLII_MAX_CALLS_PER_INVOCATION, 40),
    timeoutMs: readInt(env.CANLII_TIMEOUT_MS, 15000),
  };
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Lit `Retry-After` : soit un nombre de secondes, soit une date HTTP.
 * Renvoie null si l'en-tête est absent ou illisible.
 */
export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - now);
  return null;
}

class Client implements CanliiClient {
  #calls = 0;
  #errors = 0;
  #throttled = 0;
  #lastCallAt = 0;

  readonly #cfg: ClientConfig;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #jitter: () => number;

  constructor(cfg: ClientConfig, seams: ClientSeams = {}) {
    this.#cfg = cfg;
    this.#fetch = seams.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#sleep = seams.sleepImpl ?? defaultSleep;
    this.#jitter = seams.jitterImpl ?? (() => Math.random() * JITTER_MS);
  }

  callsMade(): number {
    return this.#calls;
  }

  remaining(): number {
    return Math.max(0, this.#cfg.maxCalls - this.#calls);
  }

  usage(): CanliiUsage {
    return { calls: this.#calls, errors: this.#errors, throttled: this.#throttled };
  }

  /**
   * Construit l'URL. `api_key` est ajoutée APRÈS les autres paramètres (§5.1) —
   * l'ordre est celui de la documentation de CanLII, et s'en écarter n'a jamais été
   * éprouvé contre le service.
   */
  #url(
    path: string,
    params: Record<string, string | number>,
    resultCountOverride?: number,
  ): string {
    const clean = path.replace(/^\/+/, "");
    const url = new URL(`${BASE}/${clean}`);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(
        k,
        String(k === "resultCount" && resultCountOverride ? resultCountOverride : v),
      );
    }
    url.searchParams.set("api_key", this.#cfg.apiKey);
    return url.toString();
  }

  async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    // Plafond dur AVANT toute dépense : lever ici, c'est garantir que le compteur
    // ne peut pas déborder même si un gestionnaire boucle par erreur.
    if (this.#calls >= this.#cfg.maxCalls) {
      throw new CanliiBudgetError(this.#calls, this.#cfg.maxCalls);
    }

    try {
      return await this.#attemptWithHalving<T>(path, params);
    } catch (err) {
      if (!(err instanceof CanliiBudgetError)) this.#errors++;
      throw err;
    }
  }

  /**
   * §5.2, charge utile : l'API refuse les transferts de plus de 10 Mo et renvoie un
   * objet portant `"error": "TOO_LONG"`. On réduit `resultCount` de moitié et on
   * réessaie UNE FOIS. Au-delà, on laisse remonter : mieux vaut un échec explicite
   * qu'une pagination silencieusement rétrécie dont l'appelant ignore tout.
   */
  async #attemptWithHalving<T>(path: string, params: Record<string, string | number>): Promise<T> {
    try {
      return await this.#request<T>(path, params);
    } catch (err) {
      const tooLong = err instanceof CanliiError && err.code === "TOO_LONG";
      const count = Number(params.resultCount);
      if (!tooLong || !Number.isFinite(count) || count <= 1) throw err;
      const halved = Math.max(1, Math.floor(count / 2));
      return await this.#request<T>(path, { ...params, resultCount: halved });
    }
  }

  async #request<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = this.#url(path, params);
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (this.#calls >= this.#cfg.maxCalls) {
        throw new CanliiBudgetError(this.#calls, this.#cfg.maxCalls);
      }
      await this.#throttle();

      let response: Response;
      this.#calls++;
      this.#lastCallAt = Date.now();
      try {
        response = await this.#fetch(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(this.#cfg.timeoutMs),
        });
      } catch (err) {
        // Une expiration de délai est réessayable : elle peut venir d'un pic passager.
        lastError =
          err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
            ? new CanliiTimeoutError(url, this.#cfg.timeoutMs)
            : err;
        if (attempt === MAX_ATTEMPTS - 1) throw lastError;
        await this.#backoff(attempt, null);
        continue;
      }

      if (response.status === 429) this.#throttled++;

      if (RETRIABLE.has(response.status)) {
        const body = await this.#safeText(response);
        lastError = new CanliiError(response.status, url, body);
        if (attempt === MAX_ATTEMPTS - 1) throw lastError;
        // `Retry-After` PRIME sur la temporisation exponentielle (§5.2).
        await this.#backoff(attempt, parseRetryAfter(response.headers.get("Retry-After")));
        continue;
      }

      if (!response.ok) {
        // 400, 401, 403, 404 : aucun réessai. Réessayer un 401 brûlerait du quota
        // sur une clef invalide ; réessayer un 404 masquerait un verdict INTROUVABLE.
        const body = await this.#safeText(response);
        throw new CanliiError(response.status, url, body, extractErrorCode(body));
      }

      const text = await this.#safeText(response);
      const parsed = safeJson(text);
      if (parsed === undefined) {
        throw new CanliiError(response.status, url, text, "REPONSE_ILLISIBLE");
      }
      // L'API peut rendre 200 avec un corps d'erreur applicatif (TOO_LONG notamment).
      const code = errorCodeOf(parsed);
      if (code) throw new CanliiError(response.status, url, text, code);
      return parsed as T;
    }

    throw lastError ?? new CanliiError(0, url, "échec inconnu");
  }

  /** Intervalle minimal entre deux appels de la MÊME invocation (§5.2). */
  async #throttle(): Promise<void> {
    if (this.#lastCallAt === 0) return;
    const waited = Date.now() - this.#lastCallAt;
    if (waited < this.#cfg.minIntervalMs) {
      await this.#sleep(this.#cfg.minIntervalMs - waited);
    }
  }

  /** Temporisation exponentielle 500 ms × 2ⁿ + gigue, sauf si `Retry-After` prime. */
  async #backoff(attempt: number, retryAfterMs: number | null): Promise<void> {
    const ms =
      retryAfterMs !== null ? retryAfterMs : BACKOFF_BASE_MS * 2 ** attempt + this.#jitter();
    await this.#sleep(ms);
  }

  async #safeText(response: Response): Promise<string> {
    try {
      return truncateBody(await response.text(), 100_000);
    } catch {
      return "";
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function errorCodeOf(parsed: unknown): string | null {
  if (parsed && typeof parsed === "object") {
    const err = (parsed as CanliiErrorBody).error;
    if (typeof err === "string" && err.length > 0) return err;
  }
  return null;
}

function extractErrorCode(body: string): string | null {
  return errorCodeOf(safeJson(body));
}

/** Instancie un client pour UNE invocation d'outil. */
export function createClient(
  env: Env,
  seams: ClientSeams = {},
  overrides: Partial<ClientConfig> = {},
): CanliiClient {
  return new Client({ ...configFromEnv(env), ...overrides }, seams);
}

/** Traduit une erreur du client en phrase française destinée à l'usager. */
export function describeError(err: unknown): string {
  if (err instanceof CanliiBudgetError) {
    return `Budget d'appels épuisé (${err.callsMade}/${err.budget}) — résultat partiel.`;
  }
  if (err instanceof CanliiTimeoutError) {
    return "Délai d'expiration dépassé en interrogeant CanLII. Réessayer plus tard.";
  }
  if (err instanceof CanliiError) {
    if (err.code === "TOO_LONG") {
      return "Réponse de CanLII trop volumineuse (plafond de 10 Mo) même après réduction de la pagination. Restreindre la fenêtre de dates.";
    }
    switch (err.status) {
      case 401:
      case 403:
        return "CanLII a refusé la clef d'API (401/403). Vérifier le secret CANLII_API_KEY.";
      case 404:
        return "Aucune fiche à cette adresse dans la collection de CanLII (404).";
      case 429:
        return "CanLII a étranglé les appels (429). Réessayer plus tard.";
      default:
        return `CanLII a renvoyé une erreur ${err.status}.`;
    }
  }
  return "Erreur inattendue en interrogeant CanLII.";
}

export { redactUrl };

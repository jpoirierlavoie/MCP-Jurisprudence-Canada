/**
 * Enveloppe JSON-RPC 2.0 du point d'entrée MCP (spécification §8).
 *
 * Port TypeScript de `athena/mcp/jsonrpc.py`. Transport Streamable HTTP en MODE JSON
 * SANS ÉTAT (décision D3) : un message JSON-RPC par POST, une réponse
 * `application/json` par requête. Aucun flux SSE, aucun `Mcp-Session-Id`, aucun
 * message initié par le serveur.
 *
 * Les lots (tableaux) sont refusés : le regroupement a été retiré de la révision
 * 2025-06-18 du protocole, et Claude n'en émet jamais.
 */

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export type RequestId = string | number | null;

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  method: string;
  id?: RequestId;
  params?: Record<string, unknown>;
}

/** Erreur de PROTOCOLE. Réservée aux fautes de forme — voir la note ci-dessous. */
export class JsonRpcError extends Error {
  readonly code: number;
  readonly requestId: RequestId;

  constructor(code: number, message: string, requestId: RequestId = null) {
    super(message);
    this.name = "JsonRpcError";
    this.code = code;
    this.requestId = requestId;
  }
}

export function resultResponse(id: RequestId, result: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, result };
}

export function errorResponse(
  id: RequestId,
  code: number,
  message: string,
  data?: unknown,
): Record<string, unknown> {
  const error: Record<string, unknown> = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

/**
 * Analyse et valide structurellement UN message JSON-RPC 2.0.
 *
 * Ne fait que valider la forme : la détection des notifications (absence d'`id`)
 * revient à l'appelant.
 */
export function parseMessage(raw: string): JsonRpcMessage {
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    throw new JsonRpcError(PARSE_ERROR, "Erreur d'analyse syntaxique (JSON invalide).");
  }

  if (Array.isArray(message)) {
    throw new JsonRpcError(INVALID_REQUEST, "Les requêtes groupées ne sont pas prises en charge.");
  }
  if (message === null || typeof message !== "object") {
    throw new JsonRpcError(INVALID_REQUEST, "Requête invalide.");
  }

  const m = message as Record<string, unknown>;
  if (m.jsonrpc !== "2.0") {
    throw new JsonRpcError(INVALID_REQUEST, 'Requête invalide : « jsonrpc » doit valoir "2.0".');
  }
  if (typeof m.method !== "string" || m.method.length === 0) {
    throw new JsonRpcError(
      INVALID_REQUEST,
      "Requête invalide : « method » doit être une chaîne non vide.",
    );
  }
  if ("id" in m && m.id !== null && typeof m.id !== "string" && typeof m.id !== "number") {
    throw new JsonRpcError(
      INVALID_REQUEST,
      "Requête invalide : « id » doit être une chaîne ou un nombre.",
    );
  }
  if (m.params !== undefined && m.params !== null && typeof m.params !== "object") {
    throw new JsonRpcError(
      INVALID_REQUEST,
      "Requête invalide : « params » doit être un objet.",
      (m.id ?? null) as RequestId,
    );
  }

  return {
    jsonrpc: "2.0",
    method: m.method,
    id: ("id" in m ? m.id : undefined) as RequestId | undefined,
    params: (m.params ?? undefined) as Record<string, unknown> | undefined,
  };
}

/** Un message sans `id` (ou avec un `id` nul) est une notification. */
export function isNotification(m: JsonRpcMessage): boolean {
  return m.id === undefined || m.id === null;
}

// ── Enveloppe des résultats d'outils ──────────────────────────────────────────

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
}

/**
 * Sortie normale d'un outil : du TEXTE FRANÇAIS, pas du JSON (décision D4).
 *
 * ⚠ On n'émet PAS `structuredContent`, et aucun outil ne déclare d'`outputSchema`.
 *
 *   Ce n'est pas un retard sur le protocole : c'est un choix, réexaminé le
 *   2026-07-23 et maintenu. Le motif tient en une phrase — la spécification MCP
 *   recommande de fournir AUSSI le texte quand on fournit du structuré, mais
 *   n'oblige aucun CLIENT à le montrer. Un client qui dispose d'un objet typé
 *   s'en sert et laisse tomber la prose ; le verdict « CONFIRMÉE » arriverait
 *   alors sans la phrase qui le borne, et `test/garde.test.ts` resterait VERT
 *   puisque le texte contiendrait toujours l'avertissement que plus personne ne lit.
 *
 *   L'argument contraire, les conditions qui justifieraient de rouvrir la question,
 *   et la forme qu'il faudrait alors adopter (un paramètre `format: "json"` dont la
 *   charge utile porte l'avertissement en champ OBLIGATOIRE, de sorte que la réserve
 *   voyage à l'intérieur des données) sont consignés en entier dans
 *   `docs/decisions/001-sortie-texte-et-outputSchema.md`. Le lire avant d'ajouter
 *   `structuredContent` ici.
 */
export function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: false };
}

/**
 * Erreur d'EXÉCUTION d'un outil.
 *
 * ⚠ ÉCART DÉLIBÉRÉ À ATHÉNA, imposé par §8 : chez Athéna, un échec de validation
 *   des arguments lève `INVALID_PARAMS` (athena/mcp/endpoint.py). Ici, TOUTE erreur
 *   d'exécution — validation comprise — est un RÉSULTAT d'outil `isError: true`,
 *   jamais une erreur JSON-RPC. Les erreurs JSON-RPC restent réservées aux fautes de
 *   protocole (méthode inconnue, JSON illisible, lot). C'est ce que prescrit la
 *   spécification MCP : le modèle doit pouvoir LIRE l'erreur et se corriger.
 */
export function err(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

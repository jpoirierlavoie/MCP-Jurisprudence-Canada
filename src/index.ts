/**
 * Worker « Jurisprudence canadienne (CanLII) » — routage, authentification,
 * coupe-circuit, et gestionnaire planifié (spécification §8, §9, §11).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠ NE JAMAIS JOURNALISER `request.url` (§9.2).                                ║
 * ║                                                                              ║
 * ║ Le secret partagé voyage dans le CHEMIN de l'URL (`POST /mcp/<secret>`),      ║
 * ║ parce que c'est la seule forme que tous les clients MCP savent produire.      ║
 * ║ Toute trace, tout `console.log`, tout message d'erreur qui reproduirait       ║
 * ║ l'URL entière publierait le secret dans `wrangler tail` et dans les journaux  ║
 * ║ d'observabilité. On journalise la MÉTHODE, le NOM D'OUTIL et le STATUT —      ║
 * ║ jamais le chemin. C'est le prix de la simplicité du modèle D7, et il doit     ║
 * ║ figurer ici en toutes lettres pour que personne ne le paie par accident.      ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { runScheduled } from "./backfill";
import { createClient } from "./canlii/client";
import { mcpActif } from "./config";
import { callTool, INSTRUCTIONS, listToolDescriptors, SERVER_INFO, TOOLS } from "./mcp/registry";
import {
  err,
  errorResponse,
  INTERNAL_ERROR,
  INVALID_REQUEST,
  isNotification,
  JsonRpcError,
  METHOD_NOT_FOUND,
  PARSE_ERROR,
  parseMessage,
  type RequestId,
  resultResponse,
  type ToolResult,
} from "./mcp/rpc";

/** Versions du protocole servies. La plus élevée EN TÊTE (§8). */
const VERSIONS = ["2025-06-18", "2025-03-26"] as const;

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

/**
 * Origines de navigateur admises.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ Deux exigences DISTINCTES se rejoignent ici, et il faut les servir toutes    ║
 * ║ les deux :                                                                   ║
 * ║                                                                              ║
 * ║ 1. CORS. `claude.ai` est une application de NAVIGATEUR. Sans pré-vol accepté ║
 * ║    et sans `Access-Control-Allow-Origin`, le navigateur refuse la requête —   ║
 * ║    et le connecteur se solde par « Impossible de joindre le serveur », alors  ║
 * ║    que le même point d'entrée répond parfaitement à un client serveur.        ║
 * ║                                                                              ║
 * ║ 2. Défense contre le RÉ-ATTACHEMENT DNS, exigée par la spécification MCP :    ║
 * ║    une origine de navigateur non reconnue est REFUSÉE. Une origine absente    ║
 * ║    (appel serveur à serveur, scripts/mcp-client.mjs) reste admise — c'est le  ║
 * ║    motif retenu par `athena/mcp/bearer.py`.                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */
const ORIGINES_PAR_DEFAUT = ["https://claude.ai", "https://claude.com"];

function originesAdmises(env: Env): string[] {
  const brut = (env.ALLOWED_ORIGINS as string | undefined) ?? "";
  const sup = brut
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  return [...ORIGINES_PAR_DEFAUT, ...sup];
}

/** Origine à refléter, ou null si l'origine est absente ou refusée. */
function originAutorisee(request: Request, env: Env): string | null {
  const o = request.headers.get("Origin");
  if (!o) return null; // serveur à serveur : pas de CORS à négocier
  return originesAdmises(env).includes(o) ? o : null;
}

/** Une origine de NAVIGATEUR présente mais non reconnue doit être refusée. */
function origineRefusee(request: Request, env: Env): boolean {
  const o = request.headers.get("Origin");
  return Boolean(o) && !originesAdmises(env).includes(o as string);
}

/**
 * En-têtes CORS d'une réponse effective.
 *
 * `Vary: Origin` est obligatoire : sans lui, un cache intermédiaire pourrait
 * resservir à une origine la réponse calculée pour une autre.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    // Le client lit ces en-têtes ; sans exposition explicite ils lui sont invisibles.
    "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Protocol-Version",
  };
}

function jsonResponse(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(origin) },
  });
}

/**
 * Réponse au pré-vol CORS.
 *
 * ⚠ Le pré-vol est traité AVANT toute vérification du secret, et c'est
 *   obligatoire : un navigateur émet `OPTIONS` SANS en-tête d'authentification et
 *   sans corps. Exiger le secret ici ferait échouer le pré-vol, donc la requête
 *   réelle, donc le connecteur — sans que rien n'ait été authentifié pour autant.
 *   Le pré-vol ne divulgue rien : il ne fait qu'annoncer ce que le serveur accepte.
 */
function preflight(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, MCP-Protocol-Version, Accept, Last-Event-ID",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}

/**
 * Comparaison À TEMPS CONSTANT, sur les empreintes plutôt que sur les chaînes (§9.1).
 *
 * Passer par SHA-256 neutralise aussi l'écart de LONGUEUR : `timingSafeEqual` exige
 * deux tampons de même taille et lèverait sur des chaînes de longueurs différentes —
 * ce qui, en soi, divulguerait la longueur du secret.
 */
async function secretOk(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/** Extrait le secret présenté : dernier segment du chemin, ou en-tête Authorization. */
function presentedSecret(request: Request, pathname: string): string | null {
  const entete = request.headers.get("Authorization");
  if (entete?.startsWith("Bearer ")) {
    const v = entete.slice(7).trim();
    if (v.length > 0) return v;
  }
  const m = /^\/mcp\/(.+)$/.exec(pathname);
  if (m?.[1]) return decodeURIComponent(m[1]);
  return null;
}

function unauthorized(origin: string | null = null): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { ...JSON_HEADERS, "WWW-Authenticate": "Bearer", ...corsHeaders(origin) },
  });
}

function methodNotAllowed(origin: string | null = null): Response {
  return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: { ...JSON_HEADERS, Allow: "POST, OPTIONS", ...corsHeaders(origin) },
  });
}

/** Origine de navigateur présente mais non reconnue (§ défense ré-attachement DNS). */
function forbiddenOrigin(): Response {
  return new Response(JSON.stringify({ error: "forbidden_origin" }), {
    status: 403,
    headers: JSON_HEADERS,
  });
}

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // Coupe-circuit (§8) : « false » => 404 sur TOUTES les routes MCP, /health
    // compris. Un /health qui répondrait encore révélerait que le service existe.
    const actif = mcpActif(env);

    if (pathname === "/health") {
      return actif ? jsonResponse({ status: "ok" }) : notFound();
    }

    if (pathname === "/mcp" || pathname.startsWith("/mcp/")) {
      if (!actif) return notFound();

      // Défense contre le ré-attachement DNS (spécification MCP) : une origine de
      // NAVIGATEUR présente mais inconnue est refusée d'emblée. Une origine absente
      // (serveur à serveur) passe — elle n'est pas soumise à la politique de même
      // origine et ne peut donc pas être détournée de cette façon.
      if (origineRefusee(request, env)) return forbiddenOrigin();
      const origin = originAutorisee(request, env);

      // Pré-vol CORS AVANT l'authentification : le navigateur l'émet sans en-tête
      // d'authentification. L'exiger ici casserait le connecteur sans rien protéger.
      if (request.method === "OPTIONS" && origin) return preflight(origin);

      // Aucun flux SSE, aucune session à supprimer : mode JSON sans état (D3).
      if (request.method !== "POST") return methodNotAllowed(origin);

      const attendu = env.MCP_SHARED_SECRET;
      const presente = presentedSecret(request, pathname);
      // Sans secret configuré, on refuse TOUT. Le contraire — laisser passer quand la
      // configuration est incomplète — serait un défaut ouvert par omission.
      if (!attendu || !presente || !(await secretOk(presente, attendu))) {
        return unauthorized(origin);
      }
      return await handleMcp(request, env, ctx, origin);
    }

    return notFound();
  },

  /**
   * Cron hebdomadaire (lundi 06:17 UTC) : rafraîchit le répertoire des bases.
   * Le moissonnage de masse (§11) n'est atteint que si BACKFILL_ENABLED === "true",
   * ce qui n'est PAS le cas par défaut et ne doit pas l'être avant la détermination
   * de §16.1 auprès de CanLII.
   */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduled(env));
  },
};

async function handleMcp(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  origin: string | null,
): Promise<Response> {
  // Négociation d'en-tête : absent => la plus ancienne version servie.
  const entete = request.headers.get("MCP-Protocol-Version");
  if (entete !== null && !VERSIONS.includes(entete as (typeof VERSIONS)[number])) {
    return jsonResponse(
      errorResponse(
        null,
        INVALID_REQUEST,
        `Version de protocole non prise en charge ; versions servies : ${VERSIONS.join(", ")}.`,
      ),
      400,
      origin,
    );
  }

  let message: ReturnType<typeof parseMessage>;
  try {
    message = parseMessage(await request.text());
  } catch (e) {
    const je = e instanceof JsonRpcError ? e : new JsonRpcError(PARSE_ERROR, "Erreur d'analyse.");
    return jsonResponse(errorResponse(je.requestId, je.code, je.message), 200, origin);
  }

  // notifications/initialized, notifications/cancelled, … : accusé de réception vide.
  if (isNotification(message))
    return new Response(null, { status: 202, headers: corsHeaders(origin) });

  const id = (message.id ?? null) as RequestId;
  const params = message.params ?? {};

  try {
    switch (message.method) {
      case "initialize":
        return jsonResponse(resultResponse(id, initialize(params)), 200, origin);
      case "ping":
        return jsonResponse(resultResponse(id, {}), 200, origin);
      case "tools/list":
        return jsonResponse(resultResponse(id, { tools: listToolDescriptors() }), 200, origin);
      case "tools/call":
        return jsonResponse(resultResponse(id, await toolsCall(params, env, ctx)), 200, origin);
      default:
        return jsonResponse(
          errorResponse(id, METHOD_NOT_FOUND, `Méthode inconnue : ${message.method}`),
          200,
          origin,
        );
    }
  } catch (e) {
    if (e instanceof JsonRpcError) {
      return jsonResponse(errorResponse(id, e.code, e.message), 200, origin);
    }
    // Journalisation SANS l'URL (§9.2) : méthode et nature de l'échec, rien d'autre.
    console.error("échec de répartition MCP", {
      method: message.method,
      error: e instanceof Error ? e.name : "inconnu",
    });
    return jsonResponse(errorResponse(id, INTERNAL_ERROR, "Erreur interne."), 200, origin);
  }
}

function initialize(params: Record<string, unknown>): Record<string, unknown> {
  const demandee = params.protocolVersion;
  const negociee =
    typeof demandee === "string" && VERSIONS.includes(demandee as (typeof VERSIONS)[number])
      ? demandee
      : VERSIONS[0]; // la plus élevée que l'on serve
  return {
    protocolVersion: negociee,
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS,
  };
}

async function toolsCall(
  params: Record<string, unknown>,
  env: Env,
  ctx: ExecutionContext,
): Promise<ToolResult> {
  const nom = params.name;
  if (typeof nom !== "string" || !(nom in TOOLS)) {
    // Outil inconnu : c'est une erreur d'EXÉCUTION rendue au modèle, pas une faute de
    // protocole — le modèle doit pouvoir la lire et se corriger (§7, conventions).
    return err(
      `Outil inconnu : « ${String(nom).slice(0, 80)} ». Outils disponibles : ${Object.keys(TOOLS).join(", ")}.`,
    );
  }

  const args = params.arguments ?? {};
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return err("« arguments » doit être un objet.");
  }

  const client = createClient(env);
  const debut = Date.now();
  try {
    return await callTool(nom, args as Record<string, unknown>, { env, db: env.DB, client, ctx });
  } catch (e) {
    console.error("échec d'exécution d'outil", {
      tool: nom,
      ms: Date.now() - debut,
      error: e instanceof Error ? e.name : "inconnu",
    });
    return err(
      "L'outil a échoué pour une raison interne. Réessayer ; si l'échec persiste, le signaler.",
    );
  }
}

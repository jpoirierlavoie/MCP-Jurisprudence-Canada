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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
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

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { ...JSON_HEADERS, "WWW-Authenticate": "Bearer" },
  });
}

function methodNotAllowed(): Response {
  return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: { ...JSON_HEADERS, Allow: "POST" },
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
      // Aucun flux SSE, aucune session à supprimer : mode JSON sans état (D3).
      if (request.method !== "POST") return methodNotAllowed();

      const attendu = env.MCP_SHARED_SECRET;
      const presente = presentedSecret(request, pathname);
      // Sans secret configuré, on refuse TOUT. Le contraire — laisser passer quand la
      // configuration est incomplète — serait un défaut ouvert par omission.
      if (!attendu || !presente || !(await secretOk(presente, attendu))) {
        return unauthorized();
      }
      return await handleMcp(request, env, ctx);
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

async function handleMcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
    );
  }

  let message: ReturnType<typeof parseMessage>;
  try {
    message = parseMessage(await request.text());
  } catch (e) {
    const je = e instanceof JsonRpcError ? e : new JsonRpcError(PARSE_ERROR, "Erreur d'analyse.");
    return jsonResponse(errorResponse(je.requestId, je.code, je.message));
  }

  // notifications/initialized, notifications/cancelled, … : accusé de réception vide.
  if (isNotification(message)) return new Response(null, { status: 202 });

  const id = (message.id ?? null) as RequestId;
  const params = message.params ?? {};

  try {
    switch (message.method) {
      case "initialize":
        return jsonResponse(resultResponse(id, initialize(params)));
      case "ping":
        return jsonResponse(resultResponse(id, {}));
      case "tools/list":
        return jsonResponse(resultResponse(id, { tools: listToolDescriptors() }));
      case "tools/call":
        return jsonResponse(resultResponse(id, await toolsCall(params, env, ctx)));
      default:
        return jsonResponse(
          errorResponse(id, METHOD_NOT_FOUND, `Méthode inconnue : ${message.method}`),
        );
    }
  } catch (e) {
    if (e instanceof JsonRpcError) {
      return jsonResponse(errorResponse(id, e.code, e.message));
    }
    // Journalisation SANS l'URL (§9.2) : méthode et nature de l'échec, rien d'autre.
    console.error("échec de répartition MCP", {
      method: message.method,
      error: e instanceof Error ? e.name : "inconnu",
    });
    return jsonResponse(errorResponse(id, INTERNAL_ERROR, "Erreur interne."));
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

/**
 * Types des réponses de l'API REST de CanLII (annexe B).
 *
 * Ces formes sont celles de la documentation officielle, vérifiées le 2026-07-23.
 * Elles sont délibérément PERMISSIVES (presque tout est optionnel) : le connecteur
 * doit dégrader proprement si un champ manque, jamais lever sur une réponse
 * inattendue. Un champ absent produit une mention « — » en sortie, pas une erreur.
 */

/** Langue de l'API. Le citateur n'accepte QUE `en` (annexe B). */
export type Lang = "fr" | "en";

/** `GET caseBrowse/{lang}/` */
export interface CaseDatabasesResponse {
  caseDatabases?: CaseDatabase[];
}
export interface CaseDatabase {
  databaseId?: string;
  jurisdiction?: string;
  name?: string;
}

/** `GET legislationBrowse/{lang}/` */
export interface LegislationDatabasesResponse {
  legislationDatabases?: LegislationDatabase[];
}
export interface LegislationDatabase {
  databaseId?: string;
  type?: string;
  jurisdiction?: string;
  name?: string;
}

/**
 * `GET caseBrowse/{lang}/{databaseId}/?offset=&resultCount=`
 *
 * ⚠ `caseId` est ici un OBJET clé par langue (`{"en": "2008scc9"}`), pas une chaîne.
 *   Toujours passer par `flattenCaseId()` (src/citation/normalize.ts).
 */
export interface CaseListResponse {
  cases?: CaseListItem[];
}
export interface CaseListItem {
  databaseId?: string;
  caseId?: Record<string, string> | string;
  title?: string;
  citation?: string;
}

/** `GET caseBrowse/{lang}/{databaseId}/{caseId}/` — la fiche complète. */
export interface CaseMetadata {
  databaseId?: string;
  caseId?: Record<string, string> | string;
  url?: string;
  title?: string;
  citation?: string;
  language?: string;
  docketNumber?: string;
  decisionDate?: string;
  keywords?: string;
  /** `${year}${databaseId}${number}` — sert de contrôle croisé (§6.3). */
  concatenatedId?: string;
}

/** `GET caseCitator/en/{databaseId}/{caseId}/{metadataType}` */
export interface CitedCasesResponse {
  citedCases?: CaseListItem[];
}
export interface CitingCasesResponse {
  citingCases?: CaseListItem[];
}
export interface CitedLegislationsResponse {
  citedLegislations?: LegislationListItem[];
}

/** `GET legislationBrowse/{lang}/{databaseId}/` */
export interface LegislationListResponse {
  legislations?: LegislationListItem[];
}
export interface LegislationListItem {
  databaseId?: string;
  legislationId?: string;
  title?: string;
  citation?: string;
  type?: string;
}

/** `GET legislationBrowse/{lang}/{databaseId}/{legislationId}/` */
export interface LegislationMetadata {
  legislationId?: string;
  url?: string;
  title?: string;
  citation?: string;
  type?: string;
  language?: string;
  dateScheme?: string;
  startDate?: string;
  endDate?: string;
  repealed?: string | boolean;
  content?: unknown[];
}

/** Corps d'erreur applicatif de l'API (p. ex. dépassement du plafond de 10 Mo). */
export interface CanliiErrorBody {
  error?: string;
  message?: string;
}

/** Correspondance `rel` -> `metadataType` du citateur (§7.4). */
export const METADATA_TYPE = {
  cited: "citedCases",
  citing: "citingCases",
  legislation: "citedLegislations",
} as const;

export type CitatorRel = keyof typeof METADATA_TYPE;

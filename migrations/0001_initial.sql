-- Migration 0001 — schéma initial du connecteur « Jurisprudence canadienne (CanLII) ».
-- Repris de la spécification §4.1, sans écart.
--
-- La base D1 sert À LA FOIS d'index de recherche et de cache (décision D5 : le compte ne
-- possède aucun namespace KV, et les métadonnées d'une décision sont quasi immuables).
-- Elle se remplit PAR L'USAGE (D6) : tout balayage effectué pour répondre à une requête
-- est persisté. Ce n'est pas un miroir téléchargé, c'est la sédimentation des appels faits.

-- Répertoire des bases de données de CanLII (cours, tribunaux, corpus législatifs).
CREATE TABLE databases (
  id            TEXT PRIMARY KEY,          -- 'qcca', 'csc-scc', 'qcs'
  kind          TEXT NOT NULL,             -- 'case' | 'legislation'
  jurisdiction  TEXT NOT NULL,             -- 'qc', 'ca', 'on', ...
  type          TEXT,                      -- STATUTE | REGULATION | ANNUAL_STATUTE (législation)
  name_fr       TEXT,
  name_en       TEXT,
  name_norm     TEXT,                      -- plié (accents, casse) pour la recherche
  refreshed_at  TEXT NOT NULL
);
CREATE INDEX idx_db_kind ON databases(kind, jurisdiction);

-- Correspondance : code de citation neutre -> databaseId + fragment employé dans caseId.
-- Seule 'csc-scc' est documentée ; le reste est amorcé puis CORRIGÉ à l'usage (§6.4).
CREATE TABLE court_codes (
  code          TEXT PRIMARY KEY,          -- 'QCCA', 'CSC', 'SCC', 'CAF' (majuscules)
  database_id   TEXT NOT NULL,
  caseid_code   TEXT NOT NULL,             -- fragment DANS le caseId : 'qcca', 'scc'
  jurisdiction  TEXT NOT NULL,
  lang          TEXT,                      -- 'fr' | 'en' | NULL (langue-neutre)
  verified      INTEGER NOT NULL DEFAULT 0,-- 1 = confirmé par un appel réussi
  note          TEXT
);

-- Codes entre parenthèses des citations attribuées par CanLII : « (QC CQ) ».
CREATE TABLE paren_codes (
  juris_code    TEXT NOT NULL,             -- 'QC', 'CA', 'ON'
  court_code    TEXT NOT NULL,             -- 'CQ', 'CS', 'CA', 'SCC'
  database_id   TEXT NOT NULL,
  verified      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (juris_code, court_code)
);

-- Fiches de décisions : à la fois index de recherche et cache.
--
-- INVARIANT : ces lignes s'écrivent par INSERT ... ON CONFLICT DO UPDATE, JAMAIS par
-- INSERT OR REPLACE. REPLACE supprime puis réinsère, ce qui change le rowid et fait
-- diverger l'index FTS5 en « external content » ci-dessous — panne silencieuse, soit
-- exactement la catégorie de défaut que ce connecteur ne peut pas se permettre.
CREATE TABLE cases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  database_id     TEXT NOT NULL,
  case_id         TEXT NOT NULL,
  lang            TEXT,                    -- langue sous laquelle CanLII a clé le caseId
  title           TEXT NOT NULL,
  title_norm      TEXT NOT NULL,           -- plié : accents, casse, ponctuation
  citation        TEXT,
  neutral_cite    TEXT,                    -- extraite et normalisée : '2020 QCCA 495'
  docket_number   TEXT,
  decision_date   TEXT,                    -- 'YYYY-MM-DD'
  keywords        TEXT,
  url             TEXT,
  concatenated_id TEXT,
  source          TEXT NOT NULL,           -- 'lookup' | 'sweep' | 'backfill'
  fetched_at      TEXT NOT NULL,
  UNIQUE (database_id, case_id)
);
CREATE INDEX idx_cases_date    ON cases(database_id, decision_date DESC);
CREATE INDEX idx_cases_neutral ON cases(neutral_cite);
CREATE INDEX idx_cases_docket  ON cases(docket_number);

-- Recherche plein texte sur l'INTITULÉ et les mots-clés — jamais sur le texte
-- de la décision, que l'API n'expose pas.
CREATE VIRTUAL TABLE cases_fts USING fts5(
  title, keywords,
  database_id UNINDEXED, case_id UNINDEXED,
  content='cases', content_rowid='id',
  tokenize="unicode61 remove_diacritics 2"
);
CREATE TRIGGER cases_ai AFTER INSERT ON cases BEGIN
  INSERT INTO cases_fts(rowid, title, keywords, database_id, case_id)
  VALUES (new.id, new.title, new.keywords, new.database_id, new.case_id);
END;
CREATE TRIGGER cases_ad AFTER DELETE ON cases BEGIN
  INSERT INTO cases_fts(cases_fts, rowid, title, keywords, database_id, case_id)
  VALUES ('delete', old.id, old.title, old.keywords, old.database_id, old.case_id);
END;
CREATE TRIGGER cases_au AFTER UPDATE ON cases BEGIN
  INSERT INTO cases_fts(cases_fts, rowid, title, keywords, database_id, case_id)
  VALUES ('delete', old.id, old.title, old.keywords, old.database_id, old.case_id);
  INSERT INTO cases_fts(rowid, title, keywords, database_id, case_id)
  VALUES (new.id, new.title, new.keywords, new.database_id, new.case_id);
END;

-- Arêtes du citateur.
CREATE TABLE citator_edges (
  from_database_id  TEXT NOT NULL,
  from_case_id      TEXT NOT NULL,
  rel               TEXT NOT NULL,         -- 'citing' | 'cited' | 'legislation'
  to_database_id    TEXT,
  to_case_id        TEXT,
  to_legislation_id TEXT,
  to_title          TEXT,
  to_citation       TEXT,
  fetched_at        TEXT NOT NULL
);
CREATE INDEX idx_edges_from ON citator_edges(from_database_id, from_case_id, rel);

-- État de moisson d'une arête : distingue « vide » de « jamais demandé ».
CREATE TABLE citator_state (
  database_id TEXT NOT NULL,
  case_id     TEXT NOT NULL,
  rel         TEXT NOT NULL,
  edge_count  INTEGER NOT NULL,
  fetched_at  TEXT NOT NULL,
  PRIMARY KEY (database_id, case_id, rel)
);

-- Curseurs du moissonnage planifié (§11).
CREATE TABLE sync_state (
  database_id   TEXT PRIMARY KEY,
  cursor_date   TEXT,
  cursor_offset INTEGER NOT NULL DEFAULT 0,
  last_run_at   TEXT,
  complete      INTEGER NOT NULL DEFAULT 0
);

-- Télémétrie : ce que l'on cherche et ne trouve pas est le signal le plus utile.
CREATE TABLE search_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           TEXT NOT NULL DEFAULT (datetime('now')),
  tool         TEXT NOT NULL,
  query        TEXT NOT NULL,
  database_id  TEXT,
  lang         TEXT,
  result_count INTEGER NOT NULL,
  verdict      TEXT,                       -- verify_citations
  fallback     TEXT
);
CREATE INDEX idx_search_log_misses ON search_log(tool, ts) WHERE result_count = 0;

-- Consommation quotidienne : le quota de CanLII n'est pas publié (§16.2).
CREATE TABLE api_usage (
  day       TEXT PRIMARY KEY,              -- 'YYYY-MM-DD' UTC
  calls     INTEGER NOT NULL DEFAULT 0,
  errors    INTEGER NOT NULL DEFAULT 0,
  throttled INTEGER NOT NULL DEFAULT 0
);

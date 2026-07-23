-- Migration 0002 — amorce du répertoire des codes de tribunaux (spécification §4.3).
--
-- Amorce MINIMALE et honnête : uniquement ce qui est soit documenté, soit vérifiable de
-- visu. Tout le reste est découvert et corrigé à l'usage (§6.4).
--
-- ⚠ Les lignes `verified = 0` sont des HYPOTHÈSES, et le code les traite comme telles :
--    - `canlii_parse_citation` annonce `constructible: 'probable'` et non 'oui' ;
--    - la boucle d'auto-correction (§6.4) tente la variante linguistique puis chaque
--      moitié d'un databaseId composé, et consigne ce qui a fonctionné ;
--    - `canlii_list_databases` signale toute ligne dont le databaseId est ABSENT du
--      répertoire réel de CanLII.
--
-- ⚠ TÂCHE D'AMORÇAGE OBLIGATOIRE après le premier déploiement (§4.3, §14 étape 7) :
--    exécuter `scripts/refresh-databases.mjs --reconcile`, puis réconcilier
--    `court_codes.database_id` contre les databaseId réellement renvoyés par
--    `caseBrowse/fr/`. NE PAS livrer les lignes fédérales `verified = 0` sans cette
--    réconciliation.

INSERT INTO court_codes (code, database_id, caseid_code, jurisdiction, lang, verified, note) VALUES
  -- Documenté par la documentation de l'API (exemple Dunsmuir).
  ('CSC',   'csc-scc', 'scc',   'ca', 'fr', 1, 'documenté : caseBrowse/fr/csc-scc/2008scc9'),
  ('SCC',   'csc-scc', 'scc',   'ca', 'en', 1, 'documenté'),
  -- Cours du Québec : le code neutre est langue-neutre et paraît identique au databaseId.
  ('QCCA',  'qcca',  'qcca',  'qc', NULL, 0, 'hypothèse : identité'),
  ('QCCS',  'qccs',  'qccs',  'qc', NULL, 0, 'hypothèse : identité'),
  ('QCCQ',  'qccq',  'qccq',  'qc', NULL, 0, 'hypothèse : identité'),
  ('QCCM',  'qccm',  'qccm',  'qc', NULL, 0, 'hypothèse : identité'),
  ('QCTAL', 'qctal', 'qctal', 'qc', NULL, 0, 'hypothèse : identité'),
  ('QCTAT', 'qctat', 'qctat', 'qc', NULL, 0, 'hypothèse : identité'),
  ('QCTAQ', 'qctaq', 'qctaq', 'qc', NULL, 0, 'hypothèse : identité'),
  ('QCTP',  'qctp',  'qctp',  'qc', NULL, 0, 'hypothèse : identité'),
  -- Fédéral : les databaseId composés NE SONT PAS documentés. À corriger à l'usage.
  ('CAF',   'caf-fca', 'fca', 'ca', 'fr', 0, 'À VÉRIFIER — motif csc-scc supposé'),
  ('FCA',   'caf-fca', 'fca', 'ca', 'en', 0, 'À VÉRIFIER'),
  ('CF',    'cf-fc',   'fc',  'ca', 'fr', 0, 'À VÉRIFIER'),
  ('FC',    'cf-fc',   'fc',  'ca', 'en', 0, 'À VÉRIFIER'),
  ('CCI',   'cci-tcc', 'tcc', 'ca', 'fr', 0, 'À VÉRIFIER'),
  ('TCC',   'cci-tcc', 'tcc', 'ca', 'en', 0, 'À VÉRIFIER');

INSERT INTO paren_codes (juris_code, court_code, database_id, verified) VALUES
  ('QC', 'CA',  'qcca', 0),
  ('QC', 'CS',  'qccs', 0),
  ('QC', 'CQ',  'qccq', 0),   -- documenté par l'exemple 2002 CanLII 32322 (QC CQ)
  ('QC', 'CM',  'qccm', 0),
  ('CA', 'SCC', 'csc-scc', 1),
  ('CA', 'CSC', 'csc-scc', 1);

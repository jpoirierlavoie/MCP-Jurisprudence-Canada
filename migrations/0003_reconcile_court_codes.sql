-- Migration 0003 — RÉCONCILIATION du répertoire des tribunaux (spécification §4.3,
-- §14 étape 7). Exécutée le 2026-07-23 contre l'API vivante de CanLII.
--
-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ Chaque ligne ci-dessous est corrigée d'après une OBSERVATION, jamais d'après  ║
-- ║ une déduction. La preuve — un caseId réellement renvoyé par CanLII — est      ║
-- ║ consignée dans la colonne `note`.                                            ║
-- ║                                                                              ║
-- ║ C'est une MIGRATION et non un `d1 execute` ponctuel, parce que la migration   ║
-- ║ 0002 réamorcerait les mauvaises valeurs sur toute base neuve : la correction  ║
-- ║ doit voyager avec le schéma, sinon le prochain déploiement propre repart avec ║
-- ║ les hypothèses démenties.                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- Méthode : `canlii_list_databases --refresh` (410 bases de jurisprudence,
-- 50 bases législatives), puis `canlii_browse_cases` sur chaque base pour lire le
-- fragment réellement employé dans les caseId.
--
-- CONSTAT CENTRAL : le fragment du caseId suit le code de citation neutre DANS LA
-- LANGUE DE LA DÉCISION, et non le databaseId. Une même base héberge donc les deux
-- formes — `fca/2026caf129` (français) et `fca/2026fca128` (anglais). C'est
-- exactement ce que la boucle d'auto-correction de §6.4 sait rattraper, mais autant
-- partir du bon pied.

-- ── Fédéral : les trois databaseId composés étaient FAUX ──────────────────────
-- La documentation ne les documentait pas ; le motif « csc-scc » supposé par
-- l'amorce ne vaut que pour la Cour suprême.

-- Cour d'appel fédérale : « caf-fca » n'existe pas — c'est « fca ».
UPDATE court_codes SET database_id = 'fca', caseid_code = 'caf', verified = 1,
  note = 'réconcilié 2026-07-23 : observé fca/2026caf129 (Pindi c. Canada, 2026 CAF 129)'
  WHERE code = 'CAF';
UPDATE court_codes SET database_id = 'fca', caseid_code = 'fca', verified = 1,
  note = 'réconcilié 2026-07-23 : observé fca/2026fca128 (Turner v. Canada, 2026 FCA 128)'
  WHERE code = 'FCA';

-- Cour fédérale : « cf-fc » n'existe pas — c'est « fct » (et non « fc »).
UPDATE court_codes SET database_id = 'fct', caseid_code = 'cf', verified = 1,
  note = 'réconcilié 2026-07-23 : observé fct/2026cf981 — databaseId « fct », pas « fc »'
  WHERE code = 'CF';
UPDATE court_codes SET database_id = 'fct', caseid_code = 'fc', verified = 1,
  note = 'réconcilié 2026-07-23 : observé fct/2026fc987 (Roghangar v. Canada, 2026 FC 987)'
  WHERE code = 'FC';

-- Cour canadienne de l'impôt : le databaseId « cci-tcc » était bon, mais le fragment
-- FRANÇAIS était faux — l'amorce donnait « tcc » aux deux langues.
UPDATE court_codes SET database_id = 'cci-tcc', caseid_code = 'cci', verified = 1,
  note = 'réconcilié 2026-07-23 : observé cci-tcc/2026cci122 — fragment français « cci », non « tcc »'
  WHERE code = 'CCI';
UPDATE court_codes SET database_id = 'cci-tcc', caseid_code = 'tcc', verified = 1,
  note = 'réconcilié 2026-07-23 : observé cci-tcc/2026tcc127 (Chobham Corp. v. The King)'
  WHERE code = 'TCC';

-- ── Québec : le TAL a GARDÉ l'identifiant de la Régie du logement ─────────────
-- Le piège annoncé par §4.2 (« Régie du logement -> TAL ») s'est matérialisé :
-- l'organisme a changé de nom, l'identifiant de CanLII non.
UPDATE court_codes SET database_id = 'qcrdl', caseid_code = 'qctal', verified = 1,
  note = 'réconcilié 2026-07-23 : observé qcrdl/2026qctal23817 — le TAL conserve le databaseId « qcrdl » de la Régie du logement'
  WHERE code = 'QCTAL';

-- ── Québec : hypothèses d'identité CONFIRMÉES par observation ─────────────────
UPDATE court_codes SET verified = 1,
  note = 'confirmé 2026-07-23 : observé qcca/2026qcca1004' WHERE code = 'QCCA';
UPDATE court_codes SET verified = 1,
  note = 'confirmé 2026-07-23 : observé qccs/2026qccs2678' WHERE code = 'QCCS';
UPDATE court_codes SET verified = 1,
  note = 'confirmé 2026-07-23 : observé qccq/2026qccq3271' WHERE code = 'QCCQ';
UPDATE court_codes SET verified = 1,
  note = 'confirmé 2026-07-23 : observé qccm/2026qccm34' WHERE code = 'QCCM';
UPDATE court_codes SET verified = 1,
  note = 'confirmé 2026-07-23 : observé qctat/2026qctat2972' WHERE code = 'QCTAT';
UPDATE court_codes SET verified = 1,
  note = 'confirmé 2026-07-23 : observé qctp/2026qctp29' WHERE code = 'QCTP';

-- ⚠ QCTAQ : la correspondance est bonne, mais RAREMENT APPLICABLE. Sur 100 fiches
--   récentes, 100 emploient un identifiant attribué par CanLII
--   (« qctaq/2026canlii72460 ») ; sur 100 fiches antérieures à 2016, une seule
--   emploie le fragment « qctaq ». Une citation « 2023 QCTAQ 123 » a donc toutes
--   les chances de rester INTROUVABLE sans que la décision soit absente : c'est
--   `canlii_find_case` qu'il faut employer pour le TAQ. La note le dit, parce qu'un
--   écart de ce genre, laissé tacite, se lit exactement comme une absence.
UPDATE court_codes SET verified = 1,
  note = 'confirmé 2026-07-23 mais PEU APPLICABLE : le TAQ numérote ses décisions via CanLII (qctaq/2026canlii72460) ; les citations neutres QCTAQ sont rares. Préférer canlii_find_case.'
  WHERE code = 'QCTAQ';

-- ── Couples entre parenthèses ─────────────────────────────────────────────────
-- Les six databaseId de `paren_codes` existent tous au répertoire réel : aucun n'a
-- été démenti. Leur `verified` reste néanmoins à 0, et c'est délibéré — l'existence
-- de la base est établie, mais la correspondance « (QC CQ) -> qccq » ne le sera que
-- par la résolution réussie d'une citation attribuée par CanLII (§6.4). Aucune
-- correction n'est donc écrite ici : il n'y a rien à corriger, et écrire un UPDATE
-- qui n'affecte aucune ligne donnerait l'illusion d'une vérification faite.

# Décision 001 — Sortie en texte français, sans `outputSchema` ni `structuredContent`

**Statut :** arrêtée · **Date :** 2026-07-23 · **Portée :** les dix outils MCP
**Se rattache à :** décision D4 de la spécification, contrat de vérité §2

---

## La question

MCP 2025-06-18 permet à un outil de déclarer un `outputSchema` et de renvoyer un
`structuredContent` : un objet typé, à côté (ou à la place) du texte. Faut-il l'adopter ?
Le connecteur pourrait rendre, pour chaque citation :

```json
{ "verdict": "CONFIRMÉE", "database_id": "qcca", "case_id": "2020qcca495",
  "decision_date": "2020-03-31", "url": "https://canlii.ca/t/…" }
```

plutôt que la prose française de l'annexe A.

## La réponse : non

Et il faut d'abord rendre justice à l'argument contraire, qui n'est pas faible.

## L'argument POUR, dans sa version forte

1. **Fiabilité de lecture.** Un modèle qui lit `verdict: "DISCORDANTE"` dans un champ ne
   peut pas se tromper ; un modèle qui lit une prose peut mal l'analyser, surtout sur un
   lot de vingt-cinq citations où les verdicts alternent.
2. **Consommation par programme.** Si Athéna (ou tout autre outil de la pratique) veut un
   jour enchaîner sur ces résultats, des champs typés sont exactement ce qu'il faut.
   Faire analyser du français par une expression régulière serait pire.
3. **C'est la direction du protocole.** Le champ existe, les clients le prendront en
   charge de mieux en mieux, et s'en priver a un coût qui croîtra.

Ces trois points sont justes. Ils perdent quand même.

## Pourquoi ils perdent

### 1. La garantie de §2 vit dans la prose, et une garantie déplaçable est une garantie perdue

Tout le dispositif de §2 tient à ceci : les mises en garde sont **inséparables du
résultat** parce qu'elles sont dans le corps de la réponse. « CONFIRMÉE » n'apparaît
jamais sans « établit l'existence et l'identité, jamais l'autorité actuelle ».

La spécification MCP recommande qu'un serveur fournissant `structuredContent` fournisse
**aussi** le texte, par compatibilité. Mais elle n'oblige aucun **client** à afficher les
deux, ni à transmettre les deux au modèle. Le comportement prévisible d'un client qui
dispose d'un objet typé est de s'en servir et d'ignorer la prose redondante.

Le résultat : un `verdict: "CONFIRMÉE"` nu, sans la phrase qui le borne. C'est exactement
la fausse assurance que ce connecteur existe pour empêcher — réintroduite par une porte
latérale, et **sans qu'aucun test n'échoue**, puisque `test/garde.test.ts` continuerait de
constater que le texte contient bien l'avertissement que plus personne ne lit.

C'est le mode de panne le plus dangereux de ce dépôt : silencieux, et invisible aux
garde-fous existants.

### 2. Un schéma de sortie doit rester en phase avec les gabarits, sinon il ment

`format/render.ts` évolue. Un `outputSchema` qui ne suivrait pas deviendrait un contrat
faux — et un schéma faux est pire que pas de schéma, parce qu'il est **cru**. Le dépôt a
déjà rencontré cette classe de défaut deux fois (le marqueur de réconciliation dupliqué de
part et d'autre d'une frontière TS/JS ; la fiche de balayage servie comme vérification).
Le remède retenu à chaque fois a été de supprimer la duplication, pas de la surveiller.

### 3. Le destinataire réel est un modèle, pas un programme

La sortie est rédigée pour être **lue**. Un modèle lit très bien le français ; c'est même
ce qu'il fait de mieux. Le gain de fiabilité du point 1 est réel mais marginal, tandis que
la perte du point 1 de la section précédente est catastrophique et silencieuse.

## Ce qu'il faudra faire si le besoin devient réel

Le jour où un consommateur PROGRAMMATIQUE existe vraiment — pas hypothétiquement — la
bonne réponse n'est **pas** `structuredContent`. C'est un paramètre explicite :

```jsonc
{ "format": { "type": "string", "enum": ["texte", "json"] } }
```

dont la charge utile JSON porte la mise en garde **comme champ obligatoire** :

```json
{
  "verdict": "CONFIRMÉE",
  "avertissement": "Établit l'existence et l'identité, jamais l'autorité actuelle…",
  "…": "…"
}
```

La différence est décisive : ici, la réserve **voyage à l'intérieur des données**. On ne
peut pas la laisser tomber sans supprimer une clef, c'est-à-dire sans un geste délibéré et
visible — au lieu de dépendre de la bonne volonté d'un client.

Conditions à réunir avant d'ouvrir ce chantier :

1. un consommateur identifié, qui existe et qui le demande ;
2. le champ `avertissement` obligatoire dans le schéma (`required`), non optionnel ;
3. un test de garde équivalent à celui de la prose, portant sur la charge utile JSON ;
4. le texte reste le format **par défaut** — `json` s'obtient en le demandant.

## Ce qui a été fait à la place

Le **titre** d'outil de MCP 2025-06-18 a été adopté (2026-07-23) : c'est un gain
d'ergonomie sans contrepartie, puisqu'un client qui l'ignore retombe sur `name`. Il porte
d'ailleurs la réserve là où elle est le plus utile — « Sorts ultérieurs — indice
heuristique » s'affiche dans l'invite d'autorisation, donc **avant** l'exécution.

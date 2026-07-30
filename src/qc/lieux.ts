/**
 * Lieux desservis par chaque greffe — relevé OFFICIEL du ministère de la Justice.
 *
 * ⚠ FICHIER GÉNÉRÉ par `scripts/extraire-lieux-mjq.mjs`. Ne pas le modifier à la
 *   main : régénérer depuis la page enregistrée.
 *
 * Source : « Numéros des greffes des palais de justice et des points de service de
 * justice », justice.gouv.qc.ca. Page enregistrée à la main — le site répond 403 à
 * toute requête automatisée. Elle porte sa propre date de mise à jour : **2026-07-22**.
 *
 * ⚠ UN GREFFE PEUT DESSERVIR PLUSIEURS LIEUX. C'est ce que `GREFFES.palais_key`, qui
 *   est 1:1, ne peut pas exprimer : il ne nomme qu'un bâtiment. Cette table-ci porte
 *   la relation réelle, un-à-plusieurs, telle que le Ministère la publie.
 *
 * `itinerant` reprend l'astérisque de la page, dont la légende est « Point de service
 * itinérant ». Il qualifie un LIEU, non le greffe : le greffe 760 tient un palais fixe
 * à Salaberry-de-Valleyfield ET un point itinérant à Vaudreuil-Dorion. Ne pas le
 * confondre avec `GREFFES.point_de_service`, qui qualifie le greffe.
 *
 * Réconciliation du 2026-07-30 contre la table portée d'Athéna — deux écarts RÉELS,
 * consignés avec leur preuve plutôt que corrigés en silence :
 *   - le greffe **625 (Senneterre, Abitibi)** manquait entièrement ; « 625-… » rendait
 *     « greffe inconnu » sur un greffe qui existe ;
 *   - **Kuujjuaq** relève du greffe **635** et n'y est PAS itinérant : c'est le siège
 *     fixe. Athéna l'avait laissé volontairement orphelin, refusant de le rattacher au
 *     jugé « sur un greffe itinérant du Nunavik ». La page officielle le dit.
 * Aucun district ne diverge, et aucun greffe de notre table n'est absent du relevé.
 */

export interface LieuMjq {
  readonly nom: string;
  /** Point de service ITINÉRANT (astérisque du MJQ). Qualifie le LIEU, pas le greffe. */
  readonly itinerant: boolean;
}

/** Date de mise à jour publiée PAR le Ministère sur la page elle-même. */
export const MJQ_MAJ = "2026-07-22";

export const LIEUX_PAR_GREFFE: Readonly<Record<string, readonly LieuMjq[]>> = {
  "100": [{ nom: "Rimouski", itinerant: false }],
  "105": [{ nom: "New Carlisle", itinerant: false }],
  "110": [{ nom: "Percé", itinerant: false }],
  "115": [{ nom: "Havre-Aubert", itinerant: false }],
  "120": [{ nom: "Amqui", itinerant: false }],
  "125": [{ nom: "Matane", itinerant: false }],
  "130": [{ nom: "Sainte-Anne-des-Monts", itinerant: false }],
  "140": [{ nom: "Gaspé", itinerant: false }],
  "145": [{ nom: "Carleton-sur-Mer", itinerant: false }],
  "150": [{ nom: "Saguenay (Chicoutimi)", itinerant: false }],
  "155": [{ nom: "Roberval", itinerant: false }],
  "160": [{ nom: "Alma", itinerant: false }],
  "170": [{ nom: "Chibougamau", itinerant: false }],
  "175": [{ nom: "Dolbeau-Mistassini", itinerant: false }],
  "200": [{ nom: "Québec", itinerant: false }],
  "235": [{ nom: "Thetford Mines", itinerant: false }],
  "240": [{ nom: "La Malbaie", itinerant: false }],
  "250": [{ nom: "Rivière-du-Loup", itinerant: false }],
  "300": [{ nom: "Montmagny", itinerant: false }],
  "350": [{ nom: "Saint-Joseph-de-Beauce", itinerant: false }],
  "400": [{ nom: "Trois-Rivières", itinerant: false }],
  "405": [{ nom: "Drummondville", itinerant: false }],
  "410": [{ nom: "Shawinigan", itinerant: false }],
  "415": [{ nom: "Victoriaville", itinerant: false }],
  "425": [{ nom: "La Tuque", itinerant: false }],
  "450": [{ nom: "Sherbrooke", itinerant: false }],
  "455": [{ nom: "Cowansville", itinerant: false }],
  "460": [{ nom: "Granby", itinerant: false }],
  "480": [{ nom: "Lac-Mégantic", itinerant: false }],
  "500": [{ nom: "Montréal", itinerant: false }],
  "505": [{ nom: "Longueuil", itinerant: false }],
  "525": [{ nom: "Montréal - Chambre de la jeunesse", itinerant: false }],
  "540": [{ nom: "Laval", itinerant: false }],
  "550": [{ nom: "Gatineau", itinerant: false }],
  "555": [{ nom: "Campbell's Bay", itinerant: false }],
  "560": [{ nom: "Mont-Laurier", itinerant: false }],
  "565": [{ nom: "Maniwaki", itinerant: false }],
  "600": [{ nom: "Rouyn-Noranda", itinerant: false }],
  "605": [{ nom: "Amos", itinerant: false }],
  "610": [{ nom: "Ville-Marie", itinerant: false }],
  "614": [
    { nom: "Chisasibi", itinerant: true },
    { nom: "Eastmain", itinerant: true },
    { nom: "Mistissini", itinerant: true },
    { nom: "Nemiscau", itinerant: true },
    { nom: "Oujé-Bougoumou", itinerant: true },
    { nom: "Waskaganish", itinerant: true },
    { nom: "Waswanipi", itinerant: true },
    { nom: "Wemindji", itinerant: false },
    { nom: "Whapmagoostui", itinerant: true },
  ],
  "615": [{ nom: "Val d'Or", itinerant: false }],
  "620": [{ nom: "La Sarre", itinerant: false }],
  "625": [{ nom: "Senneterre", itinerant: true }],
  "635": [
    { nom: "Aupaluk", itinerant: true },
    { nom: "Kangiqsualujjuaq", itinerant: true },
    { nom: "Kangiqsujuaq", itinerant: true },
    { nom: "Kangirsuk", itinerant: true },
    { nom: "Kuujjuaq", itinerant: false },
    { nom: "Quaqtaq", itinerant: true },
    { nom: "Tasiujaq", itinerant: true },
  ],
  "640": [
    { nom: "Akulivik", itinerant: true },
    { nom: "Inukjuak", itinerant: true },
    { nom: "Ivujivik", itinerant: true },
    { nom: "Kuujjuaraapik", itinerant: true },
    { nom: "Puvirnituq", itinerant: true },
    { nom: "Salluit", itinerant: true },
    { nom: "Umiujaq", itinerant: true },
  ],
  "650": [{ nom: "Sept-Îles", itinerant: false }],
  "652": [
    { nom: "Blanc-Sablon", itinerant: true },
    { nom: "Fermont", itinerant: true },
    { nom: "Havre-Saint-Pierre", itinerant: true },
    { nom: "Kawawachikamach", itinerant: true },
    { nom: "La Romaine", itinerant: true },
    { nom: "Natashquan", itinerant: true },
    { nom: "Port-Cartier", itinerant: true },
    { nom: "Saint-Augustin", itinerant: true },
    { nom: "Schefferville", itinerant: true },
  ],
  "655": [{ nom: "Baie-Comeau", itinerant: false }],
  "665": [{ nom: "Forestville", itinerant: false }],
  "700": [{ nom: "Saint-Jérôme", itinerant: false }],
  "705": [{ nom: "Joliette", itinerant: false }],
  "715": [{ nom: "Sainte-Agathe-des-Monts", itinerant: false }],
  "750": [{ nom: "Saint-Hyacinthe", itinerant: false }],
  "755": [{ nom: "Saint-Jean-sur-Richelieu", itinerant: false }],
  "760": [
    { nom: "Salaberry-de-Valleyfield", itinerant: false },
    { nom: "Vaudreuil-Dorion", itinerant: true },
  ],
  "765": [{ nom: "Sorel-Tracy", itinerant: false }],
};

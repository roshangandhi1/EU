/** Strings for the public map and the publish controls ("publicmap" namespace). */
export const publicMapStrings = {
  en: {
    title: "Where the programme works",
    intro: "Bamboo plantations, restored miombo woodland and solar boreholes built under the GoCongo programme, funded by the European Union. Locations are approximate.",
    layer: { bamboo: "Bamboo plantations", miombo: "Miombo restoration", boreholes: "Solar boreholes" },
    stat: {
      hectares: "{n} ha mapped", countedHectares: "{n} ha established", plots: "{n} plots",
      boreholes: "{n} boreholes", operational: "{n} operational", peopleServed: "{n} people served",
    },
    updated: "Updated {date}",
    none: "Nothing published yet.",
    legend: { counted: "Established", growing: "Planted, establishing", operational: "Operational", other: "Not yet operational" },
    publish: {
      button: "Publish to the public map",
      help: "Only records marked public, with an approved boundary or GPS position, are published. Locations are rounded.",
      done: "Published {n} features.",
      failed: "Could not publish: {reason}",
      view: "View public map",
    },
  },
  fr: {
    title: "Où le programme intervient",
    intro: "Plantations de bambou, forêt claire de miombo restaurée et forages solaires réalisés dans le cadre du programme GoCongo, financé par l'Union européenne. Les positions sont approximatives.",
    layer: { bamboo: "Plantations de bambou", miombo: "Restauration du miombo", boreholes: "Forages solaires" },
    stat: {
      hectares: "{n} ha cartographiés", countedHectares: "{n} ha établis", plots: "{n} parcelles",
      boreholes: "{n} forages", operational: "{n} fonctionnels", peopleServed: "{n} personnes desservies",
    },
    updated: "Mis à jour le {date}",
    none: "Rien n'a encore été publié.",
    legend: { counted: "Établi", growing: "Planté, en cours d'établissement", operational: "Fonctionnel", other: "Pas encore fonctionnel" },
    publish: {
      button: "Publier sur la carte publique",
      help: "Seuls les enregistrements marqués publics, avec une limite approuvée ou une position GPS, sont publiés. Les positions sont arrondies.",
      done: "{n} éléments publiés.",
      failed: "Publication impossible : {reason}",
      view: "Voir la carte publique",
    },
  },
};

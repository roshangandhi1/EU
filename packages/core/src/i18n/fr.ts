import type { Dictionary } from "./en";

export const fr: Dictionary = {
  common: {
    appName: "Programme GoCongo",
    signIn: "Se connecter",
    signOut: "Se déconnecter",
    email: "E-mail",
    password: "Mot de passe",
    save: "Enregistrer",
    cancel: "Annuler",
    language: "Langue",
    fundedByEu: "Financé par l'Union européenne",
    loading: "Chargement…",
  },
  sync: {
    savedOnPhone: "Enregistré sur le téléphone",
    waiting: "En attente de synchronisation ({count})",
    synced: "Synchronisé",
    failed: "Échec de la synchronisation. Nouvel essai bientôt.",
    clockSuspect: "L'horloge de ce téléphone semble incorrecte. Veuillez corriger la date et l'heure.",
    deviceRevoked: "Ce téléphone a été retiré du système.",
  },
  auth: {
    invalid: "E-mail ou mot de passe incorrect.",
    locked: "Trop de tentatives. Réessayez dans quelques minutes.",
    enterPin: "Saisissez votre code PIN",
    setPin: "Choisissez un code PIN de 4 à 6 chiffres",
  },
  setup: {
    title: "Configuration initiale",
    intro: "Créez le premier administrateur système.",
    token: "Code de configuration",
    name: "Nom complet",
    done: "Administrateur créé. Vous pouvez maintenant vous connecter.",
    closed: "La configuration est déjà terminée.",
  },
};

import type { schools as en } from "./en";

type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };

export const schools: Shape<typeof en> = {
  nav: { schools: "Écoles", students: "Élèves", attendance: "Présences", fees: "Frais scolaires", capacity: "Capacité", reports: "Rapports" },
  student: {
    firstName: "Prénom", lastName: "Nom", postName: "Post-nom", sex: "Sexe", female: "Fille", male: "Garçon",
    dateOfBirth: "Date de naissance", birthYearEstimate: "Année de naissance estimée", guardianName: "Parent ou tuteur", guardianPhone: "Téléphone du tuteur",
    village: "Village", studentNumber: "Matricule", duplicateWarning: "Cet enfant est peut-être déjà inscrit. Vérifiez avant d'enregistrer.",
  },
  attendance: { takeRegister: "Faire l'appel", allPresent: "Tous présents", markAbsent: "Touchez les élèves absents", notTaken: "Appel non fait",
    reasons: { sick: "Malade", fees: "Frais", work: "Travail", family: "Famille", unknown: "Inconnu" } },
  fees: { payment: "Paiement", amount: "Montant (FC)", receiptNumber: "Numéro de reçu", balance: "Solde", overdue: "En retard", void: "Annuler le paiement",
    voidReason: "Motif de l'annulation", notInBook: "Ce numéro de reçu n'est pas dans un carnet qui vous est attribué.", alreadyUsed: "Ce numéro de reçu est déjà utilisé." },
  capacity: { places: "Places élèves", baseline: "Existantes", new: "Nouvelles", seatsPerShift: "Places par vacation", shifts: "Vacations comptées", asAt: "Au" },
  shift: { morning: "Matin", afternoon: "Après-midi" },
  evidence: { lateSynced: "Saisi avant la date limite mais synchronisé après. À vérifier avant de l'inclure." },
};

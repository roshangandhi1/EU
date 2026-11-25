export const en = {
  common: {
    appName: "GoCongo programme",
    signIn: "Sign in",
    signOut: "Sign out",
    email: "Email",
    password: "Password",
    save: "Save",
    cancel: "Cancel",
    language: "Language",
    fundedByEu: "Funded by the European Union",
    loading: "Loading…",
  },
  sync: {
    savedOnPhone: "Saved on phone",
    waiting: "Waiting to sync ({count})",
    synced: "Synced",
    failed: "Sync failed. Will retry.",
    clockSuspect: "This phone's clock looks wrong. Please correct the date and time.",
    deviceRevoked: "This phone has been removed from the system.",
  },
  auth: {
    invalid: "Email or password is incorrect.",
    locked: "Too many attempts. Try again in a few minutes.",
    enterPin: "Enter your PIN",
    setPin: "Choose a 4 to 6 digit PIN",
  },
  setup: {
    title: "First-time setup",
    intro: "Create the first system administrator.",
    token: "Setup code",
    name: "Full name",
    done: "Administrator created. You can now sign in.",
    closed: "Setup is already complete.",
  },
} as const;

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Dictionary = Widen<typeof en>;

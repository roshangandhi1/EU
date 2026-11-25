"use client";
import { useEffect } from "react";

/**
 * When the browser refuses to submit a form, mark the form so every invalid field shows its own
 * message under it (not only the one the browser's bubble points at). See .was-validated in globals.css.
 */
export function FormValidation() {
  useEffect(() => {
    const on = (e: Event) => (e.target as HTMLInputElement).form?.classList.add("was-validated");
    document.addEventListener("invalid", on, true);
    return () => document.removeEventListener("invalid", on, true);
  }, []);
  return null;
}

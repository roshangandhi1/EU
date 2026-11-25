// Preview only: in-memory stand-in for expo-secure-store (no Keystore in a browser).
const m = new Map([["eu.deviceId", "preview-device"]]);
export const getItemAsync = async (k) => m.get(k) ?? null;
export const setItemAsync = async (k, v) => void m.set(k, v);
export const deleteItemAsync = async (k) => void m.delete(k);

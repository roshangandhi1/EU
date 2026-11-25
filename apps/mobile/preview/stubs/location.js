// Preview only: a fixed GPS fix inside demo plot B01, so "find my plot" and sample guidance render.
const pos = { coords: { latitude: -8.7052, longitude: 24.7748, accuracy: 6 } };
export const Accuracy = { High: 4 };
export const requestForegroundPermissionsAsync = async () => ({ status: "granted" });
export const getCurrentPositionAsync = async () => pos;
export const getLastKnownPositionAsync = async () => pos;
export const hasServicesEnabledAsync = async () => true;

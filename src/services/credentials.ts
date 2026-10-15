import { Capacitor, registerPlugin } from "@capacitor/core";

export interface SavedCredentials {
  account: string;
  password: string;
}
interface CredentialVaultPlugin {
  save(value: SavedCredentials): Promise<void>;
  read(): Promise<{ account?: string; password?: string }>;
  clear(): Promise<void>;
}
const vault = registerPlugin<CredentialVaultPlugin>("CredentialVault");
let browserCredentials: SavedCredentials | null = null;

// Android uses a non-exportable Keystore key. Web development keeps credentials
// only in memory; no password is written to localStorage or Preferences.
export const credentials = {
  async save(value: SavedCredentials) {
    if (Capacitor.getPlatform() === "android") await vault.save(value);
    else browserCredentials = value;
  },
  async read(): Promise<SavedCredentials | null> {
    if (Capacitor.getPlatform() !== "android") return browserCredentials;
    const value = await vault.read();
    return value.account && value.password ? (value as SavedCredentials) : null;
  },
  async clear() {
    browserCredentials = null;
    if (Capacitor.getPlatform() === "android") await vault.clear();
  },
};

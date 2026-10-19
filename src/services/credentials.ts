import { Capacitor, registerPlugin } from "@capacitor/core";
import { webCredentials } from "./web-credentials";

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

// Android uses a non-exportable Keystore key.
// Web stores encrypted credentials and a non-exportable WebCrypto key in IndexedDB.
export const credentials = {
  async save(value: SavedCredentials) {
    if (Capacitor.getPlatform() === "android") {
      await vault.save(value);
    } else {
      await webCredentials.save(value);
    }
  },
  async read(): Promise<SavedCredentials | null> {
    if (Capacitor.getPlatform() === "android") {
      const value = await vault.read();
      return value.account && value.password ? (value as SavedCredentials) : null;
    }
    return webCredentials.read();
  },
  async clear() {
    if (Capacitor.getPlatform() === "android") {
      await vault.clear();
    } else {
      await webCredentials.clear();
    }
  },
};


import { Capacitor, registerPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

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

// Android uses a non-exportable Keystore key. iOS uses secure app preferences.
// Web development keeps credentials only in memory.
export const credentials = {
  async save(value: SavedCredentials) {
    if (Capacitor.getPlatform() === "android") {
      await vault.save(value);
    } else if (Capacitor.getPlatform() === "ios") {
      await Preferences.set({
        key: "sdust_credentials",
        value: JSON.stringify(value),
      });
    } else {
      browserCredentials = value;
    }
  },
  async read(): Promise<SavedCredentials | null> {
    if (Capacitor.getPlatform() === "android") {
      const value = await vault.read();
      return value.account && value.password ? (value as SavedCredentials) : null;
    } else if (Capacitor.getPlatform() === "ios") {
      const { value } = await Preferences.get({ key: "sdust_credentials" });
      if (!value) return null;
      try {
        const parsed = JSON.parse(value);
        return parsed.account && parsed.password ? parsed : null;
      } catch (_) {
        return null;
      }
    }
    return browserCredentials;
  },
  async clear() {
    browserCredentials = null;
    if (Capacitor.getPlatform() === "android") {
      await vault.clear();
    } else if (Capacitor.getPlatform() === "ios") {
      await Preferences.remove({ key: "sdust_credentials" });
    }
  },
};


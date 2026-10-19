import type { SavedCredentials } from "./credentials";
const DB_NAME = "sdust-private";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("vault");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("凭据存储暂不可用"));
  });
}
async function access<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("vault", mode);
      const request = operation(transaction.objectStore("vault"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
export const webCredentials = {
  async save(value: SavedCredentials) {
    if (!window.isSecureContext || !crypto.subtle) throw new Error("安全存储不可用");
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value)));
    await access("readwrite", store => store.put({ key, iv, cipher }, "credentials"));
  },
  async read(): Promise<SavedCredentials | null> {
    try {
      const value = await access<any>("readonly", store => store.get("credentials"));
      if (!value) return null;
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: value.iv }, value.key, value.cipher);
      const data = JSON.parse(new TextDecoder().decode(plain));
      return typeof data.account === "string" && typeof data.password === "string" ? data : null;
    } catch (_) { return null; }
  },
  async clear() {
    await access("readwrite", store => store.delete("credentials"));
  },
};

// session-manager.js
import { cryptoService } from "./crypto-service.js";
import { dbService } from "./db-service.js";
import { getWrappedDekFromCookie } from "./service-worker-client.js";

class SessionManager {
  #dek = null; // Private field to hold the in-memory DEK

  isLocked() {
    return this.#dek === null;
  }

  lockSession() {
    this.#dek = null;
  }

  async unlockSession(pin) {
    try {
      const salt = await dbService.getMetadata("userSalt");
      const wrappedDekBuffer = await getWrappedDekFromCookie();

      if (!salt || !wrappedDekBuffer) {
        throw new Error("Device not provisioned for offline use.");
      }

      const masterKey = await cryptoService.deriveMasterKey(pin, salt);

      // unwrapDek returns an extractable CryptoKey.
      const extractableDek = await cryptoService.unwrapDek(
        masterKey,
        wrappedDekBuffer
      );

      // For better security, export the raw key material and re-import it as
      // a NON-extractable CryptoKey for the session. This prevents the key
      // from being read out of memory via the Web Crypto API.
      const rawDekBuffer = await window.crypto.subtle.exportKey(
        "raw",
        extractableDek
      );
      this.#dek = await window.crypto.subtle.importKey(
        "raw",
        rawDekBuffer,
        { name: "AES-GCM" },
        false, // Make the key non-extractable from memory for this session
        ["encrypt", "decrypt"]
      );

      console.log("Session unlocked successfully.");
      return true;
    } catch (error) {
      console.error("Failed to unlock session:", error);
      this.lockSession(); // Ensure session is locked on failure
      return false;
    }
  }

  async getDecryptedItem(id) {
    if (this.isLocked()) throw new Error("Session is locked.");
    const encryptedRecord = await dbService.getEncryptedData(id);
    if (!encryptedRecord) return null;
    const plaintext = await cryptoService.decryptData(
      this.#dek,
      encryptedRecord.data
    );
    return JSON.parse(plaintext);
  }

  async saveItem(item) {
    if (this.isLocked()) throw new Error("Session is locked.");
    const plaintext = JSON.stringify(item);
    const encryptedData = await cryptoService.encryptData(this.#dek, plaintext);
    await dbService.saveEncryptedData({ id: item.id, data: encryptedData });
  }
}

export const sessionManager = new SessionManager();

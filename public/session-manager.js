// public/session-manager.js (Updated with better logging)
import { cryptoService } from "./crypto-service.js";
import { dbService } from "./db-service.js";
import { getWrappedDekFromCookie } from "./service-worker-client.js";

class SessionManager {
  #dek = null;

  isLocked() {
    return this.#dek === null;
  }

  lockSession() {
    this.#dek = null;
  }

  async unlockSession(pin) {
    try {
      const salt = await dbService.getMetadata("userSalt");
      // New, more detailed logging
      if (!salt) {
        throw new Error("Device not provisioned: Salt not found in IndexedDB.");
      }

      const wrappedDekBuffer = await getWrappedDekFromCookie();
      // New, more detailed logging
      if (!wrappedDekBuffer) {
        throw new Error(
          "Device not provisioned: Wrapped DEK not found in cookie. Please try setting the PIN again."
        );
      }

      const masterKey = await cryptoService.deriveMasterKey(pin, salt);
      const extractableDek = await cryptoService.unwrapDek(
        masterKey,
        wrappedDekBuffer
      );
      const rawDekBuffer = await window.crypto.subtle.exportKey(
        "raw",
        extractableDek
      );
      this.#dek = await window.crypto.subtle.importKey(
        "raw",
        rawDekBuffer,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
      );

      console.log("Session unlocked successfully.");
      return true;
    } catch (error) {
      // The error thrown above will now be more specific.
      console.error("Failed to unlock session:", error);
      this.lockSession();
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

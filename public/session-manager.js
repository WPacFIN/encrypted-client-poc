// public/session-manager.js
import { cryptoService } from "./crypto-service.js";
import { dbService } from "./db-service.js";

class SessionManager {
  #dek = null;

  isLocked() {
    return this.#dek === null;
  }

  lockSession() {
    this.#dek = null;
  }

  async unlockSession(pin, username) {
    try {
      if (!username) {
        throw new Error("Username is required to unlock a session.");
      }
      const user = await dbService.getProvisionedUser(username);
      if (!user) {
        throw new Error(
          `No provisioning information found for user: ${username}`
        );
      }

      const { salt, wrappedDek } = user;

      if (!salt || !wrappedDek) {
        throw new Error(`Incomplete provisioning data for user: ${username}`);
      }

      const masterKey = await cryptoService.deriveMasterKey(pin, salt);
      this.#dek = await cryptoService.unwrapDek(masterKey, wrappedDek);

      console.log(`Session unlocked successfully for ${username}.`);
      return true;
    } catch (error) {
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

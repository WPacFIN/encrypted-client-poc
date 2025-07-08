/**
 * @file session-manager.js
 * @description This module manages the application's session state. Its primary
 * responsibility is to hold the unlocked Data Encryption Key (DEK) in memory
 * after a successful PIN entry. It provides a secure boundary, ensuring the
 * DEK is never exposed globally and can be securely erased.
 */

import { cryptoService } from "./crypto-service.js";
import { dbService } from "./db-service.js";

class SessionManager {
  // The DEK is stored in a private class field. This is a modern JavaScript
  // feature that prevents any code outside of this class instance from accessing
  // or modifying the key directly. It's a critical security boundary.
  #dek = null;

  /**
   * Checks if the session is currently locked (i.e., no DEK in memory).
   * @returns {boolean} True if the session is locked, false otherwise.
   */
  isLocked() {
    return this.#dek === null;
  }

  /**
   * Securely locks the session by erasing the in-memory DEK.
   */
  lockSession() {
    this.#dek = null;
  }

  /**
   * The core unlock logic. It takes a user's PIN and username, retrieves the
   * corresponding salt and wrappedDEK from the database, derives the master key,
   * and attempts to unwrap the DEK. If successful, the DEK is stored in memory.
   * @param {string} pin - The user's entered PIN.
   * @param {string} username - The username for which to unlock the session.
   * @returns {Promise<boolean>} True if the unlock was successful, false otherwise.
   */
  async unlockSession(pin, username) {
    try {
      if (!username) {
        throw new Error("Username is required to unlock a session.");
      }
      // Step 1: Retrieve the user's specific provisioning data from the database.
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

      // Step 2: Derive the master key from the PIN and salt. This is slow by design.
      const masterKey = await cryptoService.deriveMasterKey(pin, salt);

      // Step 3: Use the master key to unwrap (decrypt) the DEK.
      // This will fail if the PIN is incorrect, throwing an error.
      this.#dek = await cryptoService.unwrapDek(masterKey, wrappedDek);

      console.log(`Session unlocked successfully for ${username}.`);
      return true;
    } catch (error) {
      console.error("Failed to unlock session:", error);
      this.lockSession(); // Ensure the session is locked on any failure.
      return false;
    }
  }

  /**
   * Decrypts a single data item after the session has been unlocked.
   * @param {string} id - The ID of the item to decrypt.
   * @returns {Promise<Object>} The decrypted item as a JavaScript object.
   */
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

  /**
   * Encrypts and saves a single data item.
   * @param {Object} item - The item to save. Must include an 'owner' property.
   */
  async saveItem(item) {
    if (this.isLocked()) throw new Error("Session is locked.");
    const plaintext = JSON.stringify(item);
    const encryptedData = await cryptoService.encryptData(this.#dek, plaintext);
    // The 'owner' property is added here to be stored alongside the encrypted data,
    // which allows the db-service to index and retrieve data per-user.
    await dbService.saveEncryptedData({
      id: item.id,
      data: encryptedData,
      owner: item.owner,
    });
  }
}

// Export a single instance of the SessionManager to be used as a singleton
// throughout the application, ensuring there is only one session state.
export const sessionManager = new SessionManager();

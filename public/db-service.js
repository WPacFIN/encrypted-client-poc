/**
 * @file db-service.js
 * @description This file acts as a service layer for all IndexedDB operations.
 * It uses the 'idb' library to provide a clean, promise-based API for interacting
 * with the database, abstracting away the verbose native IndexedDB API. It manages
 * the database connection, schema, and all data access methods.
 */

import { openDB } from "idb";

// --- Database Configuration ---
const DB_NAME = "secure-offline-pwa-db";
const DB_VERSION = 2; // Version must be an integer. Increment it when the schema changes.
const USERS_STORE = "users"; // Stores provisioning data for each user (salt, wrappedDek).
const DATA_STORE = "app-data"; // Stores the actual encrypted application data.

// --- Database Initialization ---
// The 'idb' library's openDB function returns a promise that resolves to a DB instance.
// This promise is handled once and reused throughout the application.
const dbPromise = openDB(DB_NAME, DB_VERSION, {
  /**
   * The upgrade callback is only triggered when the DB_VERSION is higher than the
   * existing version in the browser, or if the database doesn't exist yet.
   * This is the only place where you can alter the database's structure.
   * @param {IDBPDatabase} db - The database instance.
   * @param {number} oldVersion - The previous database version.
   * @param {number} newVersion - The new database version.
   * @param {IDBPTransaction} transaction - The upgrade transaction.
   */
  upgrade(db, oldVersion, newVersion, transaction) {
    console.log(
      `Upgrading database from version ${oldVersion} to ${newVersion}`
    );
    // This structure allows for incremental upgrades. If the user is on a very old
    // version, each upgrade step will be applied sequentially.
    if (oldVersion < 2) {
      // Create the 'users' object store if it doesn't exist.
      // The keyPath specifies that the 'username' property of stored objects will be the unique key.
      if (!db.objectStoreNames.contains(USERS_STORE)) {
        db.createObjectStore(USERS_STORE, { keyPath: "username" });
      }
      // Create the 'app-data' object store if it doesn't exist.
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        const dataStore = db.createObjectStore(DATA_STORE, { keyPath: "id" });
        // An index is crucial for efficiently querying data. This index allows us
        // to fetch all data items belonging to a specific 'owner' (username)
        // without having to iterate through the entire object store.
        dataStore.createIndex("by_owner", "owner", { unique: false });
      }
      // Clean up old stores from previous versions of this demo.
      if (db.objectStoreNames.contains("metadata")) {
        db.deleteObjectStore("metadata");
      }
    }
  },
});

// --- Exported Service Object ---
// This object exposes a clean, async API for the rest of the application to use,
// hiding the complexities of IndexedDB transactions.
export const dbService = {
  /**
   * Saves or updates a user's provisioning data.
   * @param {string} username - The user's unique identifier.
   * @param {Uint8Array} salt - The user's unique salt for key derivation.
   * @param {ArrayBuffer} wrappedDek - The user's Data Encryption Key, wrapped with their Master Key.
   */
  async saveProvisionedUser(username, salt, wrappedDek) {
    const db = await dbPromise;
    return db.put(USERS_STORE, { username, salt, wrappedDek });
  },

  /**
   * Retrieves the provisioning data for a single user.
   * @param {string} username - The user to look up.
   * @returns {Promise<Object|undefined>} The user's data object, or undefined if not found.
   */
  async getProvisionedUser(username) {
    const db = await dbPromise;
    return db.get(USERS_STORE, username);
  },

  /**
   * Retrieves all users who have been provisioned on this device.
   * @returns {Promise<Array<Object>>} An array of all user objects.
   */
  async getAllProvisionedUsers() {
    const db = await dbPromise;
    return db.getAll(USERS_STORE);
  },

  /**
   * Retrieves a single encrypted data record by its ID.
   * @param {string} id - The unique ID of the data record.
   * @returns {Promise<Object|undefined>} The encrypted data record.
   */
  async getEncryptedData(id) {
    return (await dbPromise).get(DATA_STORE, id);
  },

  /**
   * Retrieves all encrypted data records for a specific user.
   * This function uses the 'by_owner' index for efficient querying.
   * @param {string} username - The owner of the data.
   * @returns {Promise<Array<Object>>} An array of encrypted data records.
   */
  async getAllDataForUser(username) {
    const db = await dbPromise;
    const tx = db.transaction(DATA_STORE, "readonly");
    const index = tx.store.index("by_owner");
    return index.getAll(username);
  },

  /**
   * Saves or updates a single encrypted data record.
   * @param {Object} data - The encrypted data record to save.
   */
  async saveEncryptedData(data) {
    return (await dbPromise).put(DATA_STORE, data);
  },
};

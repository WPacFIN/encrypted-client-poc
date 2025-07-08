// public/db-service.js
import { openDB } from "idb";

const DB_NAME = "secure-offline-pwa-db";
const DB_VERSION = 2; // Incremented DB version for schema change
const USERS_STORE = "users";
const DATA_STORE = "app-data";

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion, newVersion, transaction) {
    if (oldVersion < 2) {
      // Create new stores if they don't exist
      if (!db.objectStoreNames.contains(USERS_STORE)) {
        db.createObjectStore(USERS_STORE, { keyPath: "username" });
      }
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        db.createObjectStore(DATA_STORE, { keyPath: "id" });
      }
      // Clean up old metadata store if it exists from previous versions
      if (db.objectStoreNames.contains("metadata")) {
        db.deleteObjectStore("metadata");
      }
    }
  },
});

export const dbService = {
  async saveProvisionedUser(username, salt, wrappedDek) {
    const db = await dbPromise;
    return db.put(USERS_STORE, { username, salt, wrappedDek });
  },
  async getProvisionedUser(username) {
    const db = await dbPromise;
    return db.get(USERS_STORE, username);
  },
  async getAllProvisionedUsers() {
    const db = await dbPromise;
    return db.getAll(USERS_STORE);
  },
  async getEncryptedData(id) {
    return (await dbPromise).get(DATA_STORE, id);
  },
  async saveEncryptedData(data) {
    return (await dbPromise).put(DATA_STORE, data);
  },
};

import { openDB } from "idb";

const DB_NAME = "secure-offline-pwa-db";
const DB_VERSION = 1;
const USERS_STORE = "users";
const DATA_STORE = "app-data";

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion, newVersion, transaction) {
    if (oldVersion < 2) {
      if (!db.objectStoreNames.contains(USERS_STORE)) {
        db.createObjectStore(USERS_STORE, { keyPath: "username" });
      }
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        const dataStore = db.createObjectStore(DATA_STORE, { keyPath: "id" });
        dataStore.createIndex("by_owner", "owner", { unique: false });
      }
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
  // Get all data for a specific user
  async getAllDataForUser(username) {
    const db = await dbPromise;
    const tx = db.transaction(DATA_STORE, "readonly");
    const index = tx.store.index("by_owner");
    return index.getAll(username);
  },
  async saveEncryptedData(data) {
    return (await dbPromise).put(DATA_STORE, data);
  },
};

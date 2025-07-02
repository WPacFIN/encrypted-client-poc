// db-service.js
import { openDB } from "https://unpkg.com/idb?module";

const DB_NAME = "secure-offline-pwa-db";
const DB_VERSION = 1;
const METADATA_STORE = "metadata";
const DATA_STORE = "app-data";

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(METADATA_STORE)) {
      db.createObjectStore(METADATA_STORE);
    }
    if (!db.objectStoreNames.contains(DATA_STORE)) {
      db.createObjectStore(DATA_STORE, { keyPath: "id" });
    }
  },
});

export const dbService = {
  async getMetadata(key) {
    return (await dbPromise).get(METADATA_STORE, key);
  },
  async setMetadata(key, value) {
    return (await dbPromise).put(METADATA_STORE, value, key);
  },
  async getEncryptedData(id) {
    return (await dbPromise).get(DATA_STORE, id);
  },
  async getAllData() {
    return (await dbPromise).getAll(DATA_STORE);
  },
  async saveEncryptedData(data) {
    return (await dbPromise).put(DATA_STORE, data);
  },
};

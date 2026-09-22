export const LOCAL_DATABASE_NAME = "notetracker-local";
export const LOCAL_DATABASE_VERSION = 2;
export const DRAFTS_STORE = "drafts";
export const OFFLINE_MODULES_STORE = "offline-modules";
export const OFFLINE_IMAGES_STORE = "offline-images";

export function openLocalDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(
      LOCAL_DATABASE_NAME,
      LOCAL_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DRAFTS_STORE))
        database.createObjectStore(DRAFTS_STORE);
      if (!database.objectStoreNames.contains(OFFLINE_MODULES_STORE))
        database.createObjectStore(OFFLINE_MODULES_STORE, { keyPath: "key" });
      if (!database.objectStoreNames.contains(OFFLINE_IMAGES_STORE)) {
        const images = database.createObjectStore(OFFLINE_IMAGES_STORE, {
          keyPath: "key",
        });
        images.createIndex("by-user-topic", ["userId", "topicId"]);
        images.createIndex("by-user-module", ["userId", "moduleId"]);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Local database is blocked"));
  });
}

export function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

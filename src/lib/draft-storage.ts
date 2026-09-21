const DATABASE_NAME = "notetracker-local";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";

export function supportsDraftStorage() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Local draft database is blocked"));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function readDrafts<T>(key: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    return (await requestResult(
      transaction.objectStore(STORE_NAME).get(key),
    )) as T | undefined;
  } finally {
    database.close();
  }
}

export async function writeDrafts<T>(key: string, value: T) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function removeDrafts(key: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function removeDraftsByPrefix(prefix: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    await new Promise<void>((resolve, reject) => {
      const request = store.openKeyCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        if (typeof cursor.key === "string" && cursor.key.startsWith(prefix))
          store.delete(cursor.key);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

import {
  DRAFTS_STORE,
  openLocalDatabase,
  requestResult,
  transactionComplete,
} from "./local-database";

export function supportsDraftStorage() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export async function readDrafts<T>(key: string) {
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(DRAFTS_STORE, "readonly");
    return (await requestResult(
      transaction.objectStore(DRAFTS_STORE).get(key),
    )) as T | undefined;
  } finally {
    database.close();
  }
}

export async function writeDrafts<T>(key: string, value: T) {
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(DRAFTS_STORE, "readwrite");
    transaction.objectStore(DRAFTS_STORE).put(value, key);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function removeDrafts(key: string) {
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(DRAFTS_STORE, "readwrite");
    transaction.objectStore(DRAFTS_STORE).delete(key);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function removeDraftsByPrefix(prefix: string) {
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(DRAFTS_STORE, "readwrite");
    const store = transaction.objectStore(DRAFTS_STORE);
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

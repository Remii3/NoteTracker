import {
  OFFLINE_IMAGES_STORE,
  OFFLINE_MODULES_STORE,
  openLocalDatabase,
  requestResult,
  transactionComplete,
} from "@/lib/local-database";
import type {
  OfflineImageRecord,
  OfflineModuleSnapshot,
} from "./offline-types";

export function supportsOfflineStorage() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export function offlineModuleKey(userId: string, moduleId: string) {
  return `${userId}:${moduleId}`;
}

export async function readOfflineModule(userId: string, moduleId: string) {
  if (!supportsOfflineStorage()) return undefined;
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(OFFLINE_MODULES_STORE, "readonly");
    return (await requestResult(
      transaction
        .objectStore(OFFLINE_MODULES_STORE)
        .get(offlineModuleKey(userId, moduleId)),
    )) as OfflineModuleSnapshot | undefined;
  } finally {
    database.close();
  }
}

export async function listOfflineModules(userId: string) {
  if (!supportsOfflineStorage()) return [];
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(OFFLINE_MODULES_STORE, "readonly");
    const records = (await requestResult(
      transaction.objectStore(OFFLINE_MODULES_STORE).getAll(),
    )) as OfflineModuleSnapshot[];
    return records.filter((record) => record.userId === userId);
  } finally {
    database.close();
  }
}

export async function writeOfflineModule(snapshot: OfflineModuleSnapshot) {
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(
      OFFLINE_MODULES_STORE,
      "readwrite",
    );
    transaction.objectStore(OFFLINE_MODULES_STORE).put(snapshot);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function readOfflineTopicImages(userId: string, topicId: string) {
  if (!supportsOfflineStorage()) return [];
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(OFFLINE_IMAGES_STORE, "readonly");
    return (await requestResult(
      transaction
        .objectStore(OFFLINE_IMAGES_STORE)
        .index("by-user-topic")
        .getAll(IDBKeyRange.only([userId, topicId])),
    )) as OfflineImageRecord[];
  } finally {
    database.close();
  }
}

export async function listOfflineModuleImages(
  userId: string,
  moduleId: string,
) {
  if (!supportsOfflineStorage()) return [];
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(OFFLINE_IMAGES_STORE, "readonly");
    return (await requestResult(
      transaction
        .objectStore(OFFLINE_IMAGES_STORE)
        .index("by-user-module")
        .getAll(IDBKeyRange.only([userId, moduleId])),
    )) as OfflineImageRecord[];
  } finally {
    database.close();
  }
}

export async function replaceOfflineImages(
  userId: string,
  moduleId: string,
  records: OfflineImageRecord[],
  activeImageIds: Set<string>,
) {
  const database = await openLocalDatabase();
  try {
    const readTransaction = database.transaction(
      OFFLINE_IMAGES_STORE,
      "readonly",
    );
    const existing = (await requestResult(
      readTransaction
        .objectStore(OFFLINE_IMAGES_STORE)
        .index("by-user-module")
        .getAll(IDBKeyRange.only([userId, moduleId])),
    )) as OfflineImageRecord[];
    await transactionComplete(readTransaction);

    const writeTransaction = database.transaction(
      OFFLINE_IMAGES_STORE,
      "readwrite",
    );
    const store = writeTransaction.objectStore(OFFLINE_IMAGES_STORE);
    for (const record of existing) {
      if (!activeImageIds.has(record.metadata.id)) store.delete(record.key);
    }
    for (const record of records) store.put(record);
    await transactionComplete(writeTransaction);
  } finally {
    database.close();
  }
}

export async function removeOfflineModule(userId: string, moduleId: string) {
  if (!supportsOfflineStorage()) return;
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(
      [OFFLINE_MODULES_STORE, OFFLINE_IMAGES_STORE],
      "readwrite",
    );
    transaction
      .objectStore(OFFLINE_MODULES_STORE)
      .delete(offlineModuleKey(userId, moduleId));
    const images = transaction.objectStore(OFFLINE_IMAGES_STORE);
    const request = images
      .index("by-user-module")
      .openKeyCursor(IDBKeyRange.only([userId, moduleId]));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      images.delete(cursor.primaryKey);
      cursor.continue();
    };
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function removeOfflineModuleImages(
  userId: string,
  moduleId: string,
) {
  if (!supportsOfflineStorage()) return;
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(OFFLINE_IMAGES_STORE, "readwrite");
    const images = transaction.objectStore(OFFLINE_IMAGES_STORE);
    const request = images
      .index("by-user-module")
      .openKeyCursor(IDBKeyRange.only([userId, moduleId]));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      images.delete(cursor.primaryKey);
      cursor.continue();
    };
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function removeOfflineDataByUser(userId: string) {
  if (!supportsOfflineStorage()) return;
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction(
      [OFFLINE_MODULES_STORE, OFFLINE_IMAGES_STORE],
      "readwrite",
    );
    for (const storeName of [OFFLINE_MODULES_STORE, OFFLINE_IMAGES_STORE]) {
      const store = transaction.objectStore(storeName);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const record = cursor.value as { userId?: unknown };
        if (record.userId === userId) cursor.delete();
        cursor.continue();
      };
    }
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export type RoundDraft = {
  userId: string;
  courseId: string;
  layoutVersion: number | null;
  selectedPlayers: string[];
  playedOn: string;
  scores: Record<string, Record<string, string>>;

  newCourseLocalId: string | null;
  newCourseName: string;
  newCourseLocation: string;
  newCourseRatingFormula: string;

  draftHoles: Array<{
    id: string;
    score_index: number;
    hole_label: string;
    display_order: number;
    par: number;
    draft: true;
  }>;

  updatedAt: string;
};

const DB_NAME = "disc-golf-round-drafts";
const STORE = "drafts";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, {
          keyPath: "userId",
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));

    let result: T;

    request.onsuccess = () => {
      result = request.result;
    };

    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export function getRoundDraft(userId: string) {
  return runTransaction<RoundDraft | undefined>(
    "readonly",
    (store) => store.get(userId),
  );
}

export function saveRoundDraft(draft: RoundDraft) {
  return runTransaction<IDBValidKey>(
    "readwrite",
    (store) => store.put(draft),
  );
}

export function deleteRoundDraft(userId: string) {
  return runTransaction<undefined>(
    "readwrite",
    (store) => store.delete(userId),
  );
}

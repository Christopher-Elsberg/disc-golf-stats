export type PendingRoundCourse =
  | {
      type: "existing";
      id: string;
    }
  | {
      type: "new";
      id: string;
      name: string;
      slug: string;
      location: string | null;
      holes: Array<{
        id: string;
        score_index: number;
        hole_label: string;
        display_order: number;
        par: number;
      }>;
    };

export type PendingRoundScore = {
  player_id: string;
  course_hole_id: string;
  strokes: number;
};

export type PendingRound = {
  id: string;
  auth_user_id: string;
  played_on: string;
  course: PendingRoundCourse;
  player_ids: string[];
  scores: PendingRoundScore[];
  created_at: string;
  status: "pending" | "error";
  last_error?: string;
};

const DB_NAME = "disc-golf-stats";
const DB_VERSION = 1;
const STORE_NAME = "pending-rounds";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("Denne browser understøtter ikke IndexedDB."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error("Kunne ikke åbne offline-databasen."));

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("auth_user_id", "auth_user_id", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });
}

export async function savePendingRound(round: PendingRound): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(round);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      const error = transaction.error ?? new Error("Kunne ikke gemme runden lokalt.");
      db.close();
      reject(error);
    };
  });
}

export async function getPendingRounds(authUserId: string): Promise<PendingRound[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).index("auth_user_id").getAll(authUserId);

    request.onsuccess = () => {
      const rounds = (request.result as PendingRound[]).sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      );
      db.close();
      resolve(rounds);
    };

    request.onerror = () => {
      const error = request.error ?? new Error("Kunne ikke læse offline-runder.");
      db.close();
      reject(error);
    };
  });
}

export async function deletePendingRound(id: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      const error = transaction.error ?? new Error("Kunne ikke fjerne den synkroniserede runde lokalt.");
      db.close();
      reject(error);
    };
  });
}

export async function markPendingRoundError(round: PendingRound, message: string): Promise<void> {
  await savePendingRound({
    ...round,
    status: "error",
    last_error: message,
  });
}

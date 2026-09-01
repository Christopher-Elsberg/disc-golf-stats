export type OfflineCourseHole = {
  id: string;
  scoreIndex: number;
  holeLabel: string;
  displayOrder: number;
  par: number;
};

export type OfflineCourse =
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
      holes: OfflineCourseHole[];
    };

export type OfflineScore = {
  playerId: string;
  courseHoleId: string;
  strokes: number;
};

export type PendingRound = {
  id: string;
  authUserId: string;

  playedOn: string;

  course: OfflineCourse;

  playerIds: string[];

  scores: OfflineScore[];

  createdAt: string;

  status: "pending" | "error";

  lastError?: string;
};

const DB_NAME = "disc-golf-stats";
const DB_VERSION = 1;

const STORE_NAME = "pending-rounds";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      DB_NAME,
      DB_VERSION,
    );

    request.onerror = () => {
      reject(request.error);
    };

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(
          STORE_NAME,
          {
            keyPath: "id",
          },
        );

        store.createIndex(
          "authUserId",
          "authUserId",
          {
            unique: false,
          },
        );
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

export async function savePendingRound(
  round: PendingRound,
) {
  const db = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readwrite",
    );

    const store =
      transaction.objectStore(STORE_NAME);

    store.put(round);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function getPendingRounds(
  authUserId: string,
): Promise<PendingRound[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readonly",
    );

    const store =
      transaction.objectStore(STORE_NAME);

    const index =
      store.index("authUserId");

    const request =
      index.getAll(authUserId);

    request.onsuccess = () => {
      db.close();

      const rounds =
        request.result as PendingRound[];

      rounds.sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );

      resolve(rounds);
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function deletePendingRound(
  id: string,
) {
  const db = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      STORE_NAME,
      "readwrite",
    );

    transaction
      .objectStore(STORE_NAME)
      .delete(id);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function markPendingRoundError(
  round: PendingRound,
  error: string,
) {
  await savePendingRound({
    ...round,
    status: "error",
    lastError: error,
  });
}

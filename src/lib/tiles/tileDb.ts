// IndexedDB cache for sheet image pyramids (preview, thumbnail and tiles), in its own database so it never touches
// the synced app data (db.ts). Keyed by image id: an image never changes once saved (rotating saves a new one), so a
// cache entry never goes stale. Raw IndexedDB because it also runs inside the tile worker.

export interface PyramidMeta {
  imageId: string;
  width: number;
  height: number;
  tileSize: number;
  previewMax: number;
  preview: Blob;
  thumb: Blob;
  /** Every tile is stored (false while only the preview and thumbnail exist). */
  complete: boolean;
  usedAt: number;
}

const DB_NAME = "pinplan-tiles";
/** Keep tiles for this many images; older ones are dropped (they rebuild from the sheet image on demand). */
export const KEEP_IMAGES = 24;

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "imageId" });
        if (!d.objectStoreNames.contains("tiles")) d.createObjectStore("tiles");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        opening = null;
        reject(req.error);
      };
    });
  }
  return opening;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getMeta(imageId: string): Promise<PyramidMeta | undefined> {
  const d = await openDb();
  return done(d.transaction("meta").objectStore("meta").get(imageId) as IDBRequest<PyramidMeta | undefined>);
}

export async function putMeta(meta: PyramidMeta): Promise<void> {
  const d = await openDb();
  const tx = d.transaction("meta", "readwrite");
  tx.objectStore("meta").put(meta);
  await txDone(tx);
}

export async function getTileBlob(key: string): Promise<Blob | undefined> {
  const d = await openDb();
  return done(d.transaction("tiles").objectStore("tiles").get(key) as IDBRequest<Blob | undefined>);
}

export async function putTileBlobs(entries: [string, Blob][]): Promise<void> {
  if (!entries.length) return;
  const d = await openDb();
  const tx = d.transaction("tiles", "readwrite");
  const s = tx.objectStore("tiles");
  for (const [k, b] of entries) s.put(b, k);
  await txDone(tx);
}

/** Forget an image's pyramid (meta and tiles). */
export async function deletePyramid(imageId: string): Promise<void> {
  const d = await openDb();
  const tx = d.transaction(["meta", "tiles"], "readwrite");
  tx.objectStore("meta").delete(imageId);
  tx.objectStore("tiles").delete(IDBKeyRange.bound(`${imageId}/`, `${imageId}/￿`));
  await txDone(tx);
}

/** Drop the least recently used pyramids beyond `keep`. */
export async function prunePyramids(keep = KEEP_IMAGES): Promise<void> {
  const d = await openDb();
  const all = await done(d.transaction("meta").objectStore("meta").getAll() as IDBRequest<PyramidMeta[]>);
  const old = all.sort((a, b) => b.usedAt - a.usedAt).slice(keep);
  for (const m of old) await deletePyramid(m.imageId);
}

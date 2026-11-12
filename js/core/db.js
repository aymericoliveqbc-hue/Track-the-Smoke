// Accès IndexedDB — stockage local, persistant, sans aucun envoi réseau.
// Deux bases totalement séparées : données personnelles et mode démo.

export const DB_MAIN = 'track-the-smoke';
export const DB_DEMO = 'track-the-smoke-demo';
const VERSION = 1;
export const STORE_NAMES = ['meta', 'entries', 'nights', 'products', 'purchases', 'inventories', 'categories', 'goals', 'backups'];

const reqP = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const txDone = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

export class DB {
  constructor(name) { this.name = name; this.db = null; }

  async open() {
    if (this.db) return this;
    this.db = await new Promise((res, rej) => {
      const req = indexedDB.open(this.name, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORE_NAMES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error('Base de données bloquée par un autre onglet.'));
    });
    return this;
  }

  close() { this.db?.close(); this.db = null; }

  async all(store) {
    return reqP(this.db.transaction(store).objectStore(store).getAll());
  }

  async get(store, id) {
    return reqP(this.db.transaction(store).objectStore(store).get(id));
  }

  async put(store, value) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    return txDone(tx);
  }

  async delete(store, id) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    return txDone(tx);
  }

  /** Remplace intégralement le contenu de plusieurs stores, de façon atomique. */
  async replaceAll(map) {
    const names = Object.keys(map);
    const tx = this.db.transaction(names, 'readwrite');
    for (const n of names) {
      const os = tx.objectStore(n);
      os.clear();
      for (const v of map[n]) os.put(v);
    }
    return txDone(tx);
  }

  async clearAll() {
    const tx = this.db.transaction(STORE_NAMES, 'readwrite');
    for (const n of STORE_NAMES) tx.objectStore(n).clear();
    return txDone(tx);
  }

  static async destroy(name) {
    return new Promise((res) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => res();
    });
  }
}

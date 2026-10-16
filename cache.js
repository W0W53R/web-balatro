/**
 * Built versions are stored as zip Blobs in the "cache" object store of
 * BalatroCacheDB, keyed by version name.
 *
 * Every helper closes the database once it's done so that other tabs can
 * open it (Issue #1).
 */

/**
 *
 * @returns {Promise<IDBDatabase>}
 */
function openGameDB() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
            reject(new Error("This browser doesn't support IndexedDB, which is needed to store games and saves. Private browsing modes sometimes disable it."))
            return
        }

        let request
        try {
            request = indexedDB.open("BalatroCacheDB", 1);
        } catch (err) {
            reject(err)
            return
        }

        request.onupgradeneeded = () => {
            request.result.createObjectStore("cache");
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not open the game cache."));
        request.onblocked = () => reject(new Error("The game cache is in use by another tab. Close other Balatro tabs and try again."));
    });
}

/**
 * Run a single request against the "cache" store and close the database afterwards.
 *
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest} makeRequest
 * @returns {Promise<any>} The request's result, once its transaction has completed.
 */
async function withCacheStore(mode, makeRequest) {
    const db = await openGameDB();
    return new Promise((resolve, reject) => {
        let request
        try {
            const tx = db.transaction("cache", mode);
            request = makeRequest(tx.objectStore("cache"));
            tx.oncomplete = () => {
                db.close()
                resolve(request.result)
            };
            tx.onerror = tx.onabort = () => {
                db.close()
                const err = tx.error || request.error
                if (err && err.name === "QuotaExceededError") {
                    reject(new Error("Your browser ran out of storage space for this site. Delete an old version and try again."))
                } else {
                    reject(err || new Error("A game cache operation failed."))
                }
            };
        } catch (err) {
            db.close()
            reject(err)
        }
    });
}

/**
 * @param {string} key - Version name
 * @returns {Promise<Blob | null>}
 */
async function loadCachedGame(key="vanilla") {
    return (await withCacheStore("readonly", (store) => store.get(key))) || null
}

/**
 * @param {Blob} blob
 * @param {string} key - Version name
 */
async function saveGameToCache(blob, key="vanilla") {
    await withCacheStore("readwrite", (store) => store.put(blob, key))
}

/**
 * @param {string} key - Version name
 */
async function deleteCachedGame(key) {
    await withCacheStore("readwrite", (store) => store.delete(key))
}

/**
 * @returns {Promise<string[]>} Names of every cached version.
 */
async function listCachedVersions() {
    return withCacheStore("readonly", (store) => store.getAllKeys())
}

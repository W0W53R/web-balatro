/**
 * Save data import / export.
 *
 * love.js keeps each version's save directory in an Emscripten IDBFS database
 * named "Balatro_<version>_/home/web_user/love" (see the prefix applied in
 * runVersion.js). Each record in its FILE_DATA store is keyed by absolute path
 * and holds { mode, timestamp, contents? }.
 */

const SAVE_ROOT = "/home/web_user/love/game"

const DIR_PERMS = 16832
const FILE_PERMS = 33152
const SETTINGS_PERMS = 33206

function saveDBName(version) {
    return "Balatro_" + version + "_/home/web_user/love"
}

/**
 * Open a version's save database.
 *
 * @param {string} version
 * @param {boolean} create - Create the database if this version has never been played.
 * @returns {Promise<IDBDatabase | null>} null when the database doesn't exist and `create` is false.
 */
function openSaveDB(version, create) {
    return new Promise((resolve, reject) => {
        let aborted = false
        const request = indexedDB.open(saveDBName(version))
        request.onupgradeneeded = () => {
            if (!create) {
                // Never played: don't leave an empty database behind.
                aborted = true
                request.transaction.abort()
                return
            }
            // Mirror IDBFS.getDB so love.js can use the database as-is.
            const store = request.result.createObjectStore("FILE_DATA")
            store.createIndex("timestamp", "timestamp", { unique: false })
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = (event) => {
            if (aborted) {
                event.preventDefault()
                resolve(null)
            } else {
                reject(request.error || new Error("Could not open the save database."))
            }
        }
        request.onblocked = () => reject(new Error("The save data is in use by another tab. Close any tab running this version and try again."))
    })
}

/** Resolve once `tx` commits; reject if it fails. */
function transactionDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = tx.onabort = () => reject(tx.error || new Error("A save data operation failed."))
    })
}

/**
 * Read every save file of a version.
 *
 * @param {string} version
 * @returns {Promise<Object<string, Uint8Array>>} Paths relative to the save directory.
 */
async function readSaveFiles(version) {
    const db = await openSaveDB(version, false)
    if (!db) return {}
    try {
        if (!db.objectStoreNames.contains("FILE_DATA")) return {}
        const tx = db.transaction("FILE_DATA", "readonly")
        const store = tx.objectStore("FILE_DATA")
        const keys = store.getAllKeys()
        const values = store.getAll()
        await transactionDone(tx)

        const files = {}
        keys.result.forEach((key, i) => {
            const record = values.result[i]
            if (typeof key === "string" && key.startsWith(SAVE_ROOT + "/") && record && record.contents) {
                // love.js may store an Int8Array (a view of its heap); JSZip wants bytes.
                const contents = record.contents
                files[key.slice(SAVE_ROOT.length + 1)] = ArrayBuffer.isView(contents)
                    ? new Uint8Array(contents.buffer, contents.byteOffset, contents.byteLength)
                    : new Uint8Array(contents)
            }
        })
        return files
    } finally {
        db.close()
    }
}

/**
 * Replace all save files of a version.
 *
 * @param {string} version
 * @param {Object<string, {mode: number, timestamp: Date, contents?: Uint8Array}>} records - Keyed by absolute path.
 */
async function writeSaveRecords(version, records) {
    const db = await openSaveDB(version, true)
    try {
        const tx = db.transaction("FILE_DATA", "readwrite")
        const store = tx.objectStore("FILE_DATA")
        store.clear()
        for (const [path, record] of Object.entries(records)) {
            store.put(record, path)
        }
        await transactionDone(tx)
    } finally {
        db.close()
    }
}

/**
 * Delete all save files of a version.
 *
 * @param {string} version
 */
async function clearSaveFiles(version) {
    const db = await openSaveDB(version, false)
    if (!db) return
    try {
        if (!db.objectStoreNames.contains("FILE_DATA")) return
        const tx = db.transaction("FILE_DATA", "readwrite")
        tx.objectStore("FILE_DATA").clear()
        await transactionDone(tx)
    } finally {
        db.close()
    }
}

/**
 * @param {string} version
 * @returns {Promise<Blob | null>} A zip of the save directory, or null when there is no save yet.
 */
async function exportSave(version) {
    const files = await readSaveFiles(version)
    const paths = Object.keys(files)
    if (paths.length == 0) return null

    const zip = new JSZip()
    for (const path of paths) {
        zip.file(path, files[path], { createFolders: true })
    }
    return zip.generateAsync({ type: "blob" })
}

/**
 * Convert a save zip into IDBFS records.
 *
 * Accepts both a zip of the save folder's contents (settings.jkr, 1/, 2/, …)
 * and a zip of the folder itself, e.g. "Balatro/settings.jkr".
 *
 * @param {Blob} blob
 * @returns {Promise<Object<string, {mode: number, timestamp: Date, contents?: Uint8Array}>>}
 */
async function parseSaveZip(blob) {
    let zip
    try {
        zip = await JSZip.loadAsync(blob)
    } catch {
        throw new Error("That file isn't a valid zip archive.")
    }

    const entries = Object.values(zip.files).filter((file) => {
        if (file.dir) return false
        const name = file.name
        return !name.startsWith("__MACOSX/") && !/(^|\/)\.DS_Store$/.test(name) && !/(^|\/)desktop\.ini$/i.test(name)
    })

    const names = entries.map((file) => file.name.replace(/^\.?\//, ""))

    // Strip a single wrapping folder, unless it's a profile folder such as "1/".
    const tops = new Set(names.map((name) => name.split("/")[0]))
    let prefix = ""
    if (tops.size == 1 && names.every((name) => name.includes("/"))) {
        const top = [...tops][0]
        if (!/^\d+$/.test(top)) prefix = top + "/"
    }

    if (!names.some((name) => name.endsWith(".jkr"))) {
        throw new Error("That zip doesn't look like Balatro save data (no .jkr files were found).")
    }

    const now = new Date()
    const records = {}
    records[SAVE_ROOT] = { mode: DIR_PERMS, timestamp: now }

    for (let i = 0; i < entries.length; i++) {
        const relative = names[i].slice(prefix.length)
        if (!relative) continue

        // Make sure every parent directory exists, even if the zip has no folder entries.
        const parts = relative.split("/")
        for (let depth = 1; depth < parts.length; depth++) {
            const dir = SAVE_ROOT + "/" + parts.slice(0, depth).join("/")
            records[dir] = records[dir] || { mode: DIR_PERMS, timestamp: now }
        }

        records[SAVE_ROOT + "/" + relative] = {
            mode: relative == "settings.jkr" ? SETTINGS_PERMS : FILE_PERMS,
            timestamp: entries[i].date || now,
            contents: await entries[i].async("uint8array"),
        }
    }
    return records
}


/**
 * 
 * @param {IDBRequest} idbRequest - A request to unwrap
 * @returns {Promise<any>} - The output of the IDBRequest
 */
function unwrapIDBRequest(idbRequest) {
    return new Promise((res, rej) => {
        idbRequest.onsuccess = function(event) {
            res(event.result)
        }
        idbRequest.onerror = function() {
            rej()
        }
    })
}

/** @type {string} - The IndexedDB ID of the currently loaded game */
let loaded_game_id = null;

/**
 * 
 * @param {string} versionId - The IndexedDB ID of the version to load
 */
async function loadVersion(versionId) {
    const progress_bar = $("progressBar")
    const status_text = $("status")

    const loaded_version_name = $("loadedName")

    const run_button = $("runBtn")
    const download_cache_button = $("downloadCachedBtn")
    const make_portable_button = $("makePortableBtn")

    const save_download = $("save-download")
    const save_upload = $("save-upload")
    const save_delete = $("save-delete")

    if (!versionId) {
        loaded_version_name.innerText = "Nothing loaded"

        run_button.disabled = true;
        download_cache_button.disabled = true;
        make_portable_button.disabled = true;

        save_download.disabled = true;
        save_upload.disabled = true;
        save_delete.disabled = true;
    }

    /** @type {string[]} */
    const cached_list = await listCachedVersions()
    if (cached_list.indexOf(versionId) == -1) {
        throw new Error("Unknown version '" + versionId + "'")
    }
    loaded_game_id = versionId;

    loaded_version_name.innerText = loaded_game_id

    run_button.disabled = false;

    run_button.onclick = function() {
        runVersion(loaded_game_id)
    }

    download_cache_button.disabled = false;

    download_cache_button.onclick = async function() {
        status_text.innerText = "Loading Game"
        progress_bar.value = 0;

        const game = await loadCachedGame(loaded_game_id)

        status_text.innerText = "Saving"
        progress_bar.value = 50;

        saveAs(game, "balatro_" + loaded_game_id + ".zip")

        status_text.innerText = "Ready"
        progress_bar.value = 0;
    }

    make_portable_button.disabled = false;

    make_portable_button.onclick = async function() {
        const game = await loadCachedGame(loaded_game_id)

        status_text.innerText = "Fetching Template"
        progress_bar.value = 0;
        var s = document.createElement('script');
        s.type = 'text/javascript';
        s.src = "single_file.js"; // THICC FILE
        s.async = true;
        s.onload = async function () {
            status_text.innerText = "Filling Template"
            progress_bar.value = 30;
            const game_uri = await getDataURIFromBlob(game)

            const zip = new JSZip()
            for (const file_name of Object.keys(window.templates)) {
                progress_bar.value += 20;
                let contents = window.templates[file_name].replace("%%DATAURI%%", game_uri).replace("%%VERSION_NAME%%", loaded_game_id)
                if (file_name === "index.html") {
                    // Copy/paste support (see setupClipboardBridge in runVersion.js)
                    contents = contents.replace('<script src="love.min.js"></script>', (tag) =>
                        "<script>" + setupClipboardBridge.toString() + ";setupClipboardBridge()</script>" + tag)
                }
                zip.file(file_name, contents)
            }
            status_text.innerText = "Zipping"
            progress_bar.value = 95;
            saveAs(await zip.generateAsync({type: "blob"}), "balatro.zip")
            
            status_text.innerText = "Ready"
            progress_bar.value = 0;
        };
        document.body.appendChild(s);
    }


    save_download.disabled = false;

    save_download.onclick = async function() {
        const save_data_id = "Balatro_" + loaded_game_id + "_/home/web_user/love"

        const zip = new JSZip();

        
        status_text.innerText = "Opening Save Database"
        progress_bar.value = 0;

        // Open the IndexedDB database
        const request = indexedDB.open(save_data_id);
        /** @type {IDBDatabase} */
        const db = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        // Open the "FILE_DATA" object store
        const tx = db.transaction('FILE_DATA', 'readonly');
        const store = tx.objectStore('FILE_DATA');

        status_text.innerText = "Reading database files"
        progress_bar.value = 10;

        // Read all files from the store
        const files = await new Promise((resolve, reject) => {
            const allFiles = {};
            const cursorRequest = store.openCursor();

            cursorRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const path = cursor.key.replace("/home/web_user/love/game/", "");
                const metadata = cursor.value;
                if (metadata.contents) {
                    allFiles[path] = new Blob([metadata.contents]);
                }
                cursor.continue();
            } else {
                resolve(allFiles);
            }
            };
            cursorRequest.onerror = () => reject(cursorRequest.error);
        });

        db.close()

        const step_size = 50 / Object.entries(files).length

        // Add each file to the zip
        for (const [path, blob] of Object.entries(files)) {
            if (blob instanceof Blob) {
                status_text.innerText = "Zipping " + path
                progress_bar.value += step_size;
                zip.file(path, blob, {createFolders: true});
            }
        }

        status_text.innerText = "Zipping"
        progress_bar.value = 75;

        const zipBlob = await zip.generateAsync({ type: 'blob' });

        status_text.innerText = "Downloading"
        progress_bar.value = 90;

        saveAs(zipBlob, `balatro_${loaded_game_id}_save_data.zip`)

        status_text.innerText = "Ready"
        progress_bar.value = 0;
    }

    save_upload.disabled = false;

    save_upload.onclick = async function() {

        status_text.innerText = "Reqesting Save Data"
        progress_bar.value = 0;

        /** @type {FileSystemFileHandle[]} */
        const fileHandles = await showOpenFilePicker({
            id: "balatro_save",
            types: [
                {
                    description: "Zipped Archives",
                    accept: {
                        "application/zip": [".zip"]
                    }
                }
            ],
            excludeAcceptAllOption: true,
            multiple: false,
        })

        if (fileHandles.length == 0) {
            // Silently ignore if user cancels
            return;
        }

        const fileHandle = fileHandles[0]

        const fileBlob = await fileHandle.getFile()

        status_text.innerText = "Extracting Zip"
        progress_bar.value = 0;

        const zipFile = await JSZip.loadAsync(fileBlob)

        const DIR_PERMS = 16832
        const FILE_PERMS = 33152
        const SETTINGS_PERMS = 33206

        const save_data_id = "Balatro_" + loaded_game_id + "_/home/web_user/love"

        status_text.innerText = "Opening Save Database"
        progress_bar.value = 20;

        const request = indexedDB.open(save_data_id);
        /** @type {IDBDatabase} */
        const db = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        db.onerror = console.error

        const zip_contents = {}

        status_text.innerText = "Scanning save data"
        progress_bar.value = 40;

        for (const file of Object.values(zipFile.files)) {
            if (file.name.endsWith("/")) {
                file.name = file.name.slice(0, -1)
            }
            if (file.dir) {
                zip_contents["/home/web_user/love/game/" + file.name] = {
                    mode: DIR_PERMS,
                    timestamp: file.date
                }
            } else {
                const arrayBuffer = await zipFile.file(file.name).async("arrayBuffer")

                const contents = new Int8Array(arrayBuffer)

                zip_contents["/home/web_user/love/game/" + file.name] = {
                    mode: file.name == "settings.jkr" ? SETTINGS_PERMS : FILE_PERMS,
                    timestamp: file.date,
                    contents: contents
                }
            }
        }

        // Open the "FILE_DATA" object store
        let tx = db.transaction('FILE_DATA', 'readwrite');
        let store = tx.objectStore('FILE_DATA');

        status_text.innerText = "Clearing cache"
        progress_bar.value = 60;

        await new Promise((resolve, reject) => {
            const cursorRequest = store.openCursor();

            cursorRequest.onsuccess = async (event) => {
                /** @type {IDBCursorWithValue} */
                const cursor = event.target.result;
                if (cursor) {
                    await unwrapIDBRequest(store.delete(cursor.key))

                    cursor.continue();
                } else {
                    resolve();
                }
            };
            cursorRequest.onerror = () => reject(cursorRequest.error);
        });
        
        tx = db.transaction('FILE_DATA', 'readwrite');

        tx.onerror = console.error

        store = tx.objectStore('FILE_DATA');

        status_text.innerText = "Writing save to cache"
        progress_bar.value = 80;
        
        store.add({
            mode: DIR_PERMS,
            timestamp: new Date()
        }, "/home/web_user/love/game")

        const promises = []

        for (const [name, data] of Object.entries(zip_contents)) {
            store.add(data, name)
        }

        await Promise.all(promises);

        status_text.innerText = "Cleaning Up"
        progress_bar.value = 100;

        db.close()

        status_text.innerText = "Ready"
        progress_bar.value = 0;
    }

    save_delete.disabled = false;

    save_delete.onclick = async function() {

        status_text.innerText = "Aquiring confirmation"
        progress_bar.value = 0;

        await Promise.resolve()

        if (!confirm("Delete ALL save data for version '" + loaded_game_id + "'?")) {
            status_text.innerText = "Ready"
            progress_bar.value = 0;
            return
        }

        const save_data_id = "Balatro_" + loaded_game_id + "_/home/web_user/love"

        status_text.innerText = "Opening Save Database"
        progress_bar.value = 40;

        const request = indexedDB.open(save_data_id);
        /** @type {IDBDatabase} */
        const db = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        let tx = db.transaction('FILE_DATA', 'readwrite');
        let store = tx.objectStore('FILE_DATA');

        status_text.innerText = "Clearing Files"
        progress_bar.value = 80;

        await new Promise((resolve, reject) => {
            const cursorRequest = store.openCursor();

            cursorRequest.onsuccess = async (event) => {
                /** @type {IDBCursorWithValue} */
                const cursor = event.target.result;
                if (cursor) {
                    await unwrapIDBRequest(store.delete(cursor.key))

                    cursor.continue();
                } else {
                    resolve();
                }
            };
            cursorRequest.onerror = () => reject(cursorRequest.error);
        });

        status_text.innerText = "Ready"
        progress_bar.value = 0;
    }
}
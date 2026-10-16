/** @type {string | null} - The IndexedDB ID of the currently loaded game */
let loaded_game_id = null;

const LAST_VERSION_KEY = "web-balatro:lastVersion"

/** Remember (or forget) the loaded version so it's selected on the next visit. */
function rememberLoadedVersion(versionId) {
    try {
        if (versionId) {
            localStorage.setItem(LAST_VERSION_KEY, versionId)
        } else {
            localStorage.removeItem(LAST_VERSION_KEY)
        }
    } catch {
        // Storage may be unavailable (e.g. blocked cookies); this is only a convenience.
    }
}

function getRememberedVersion() {
    try {
        return localStorage.getItem(LAST_VERSION_KEY)
    } catch {
        return null
    }
}

/** Make a string safe to use as a download file name. */
function safeFileName(name) {
    return name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
}

/**
 * Fill in the portable player's placeholders.
 *
 * @param {string} template
 * @param {string} game_uri
 * @param {string} version
 */
function fillPortableTemplate(template, game_uri, version) {
    // Inserted into a double-quoted JS string inside a <script> tag.
    const js_name = JSON.stringify(version).slice(1, -1).replace(/</g, "\\u003c")
    const html_name = version.replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";")
    // Function replacers, so "$" in the inputs is never treated as a pattern.
    return template
        .replace("%%DATAURI%%", () => game_uri)
        .replaceAll("%%VERSION_NAME%%", () => js_name)
        .replaceAll("%%VERSION_TITLE%%", () => html_name)
}

/**
 *
 * @param {string | null} versionId - The IndexedDB ID of the version to load, or null to unload.
 */
async function loadVersion(versionId) {
    const loaded_version_name = $("loadedName")

    const run_button = $("runBtn")
    const download_cache_button = $("downloadCachedBtn")
    const make_portable_button = $("makePortableBtn")

    const save_download = $("save-download")
    const save_upload = $("save-upload")
    const save_delete = $("save-delete")

    const buttons = [run_button, download_cache_button, make_portable_button, save_download, save_upload, save_delete]

    if (!versionId) {
        loaded_version_name.innerText = "Nothing loaded"
        for (const button of buttons) {
            button.disabled = true
            button.onclick = null
        }
        loaded_game_id = null;
        rememberLoadedVersion(null)
        $("playerHint").hidden = false;
        highlightLoadedVersion()
        return
    }

    /** @type {string[]} */
    const cached_list = await listCachedVersions()
    if (cached_list.indexOf(versionId) == -1) {
        throw new Error("Unknown version '" + versionId + "'")
    }
    loaded_game_id = versionId;
    rememberLoadedVersion(versionId)

    loaded_version_name.innerText = loaded_game_id
    $("playerHint").hidden = true;
    highlightLoadedVersion()

    for (const button of buttons) {
        button.disabled = false
    }

    run_button.onclick = guarded(async function() {
        await runVersion(loaded_game_id)
    })

    download_cache_button.onclick = guarded(async function() {
        setStatus("Loading game", 0)

        const game = await loadCachedGame(loaded_game_id)
        if (!game) throw new Error("Version '" + loaded_game_id + "' is missing from the cache.")

        setStatus("Saving", 50)
        saveAs(game, "balatro_" + safeFileName(loaded_game_id) + ".love")
    })

    make_portable_button.onclick = guarded(async function() {
        const game = await loadCachedGame(loaded_game_id)
        if (!game) throw new Error("Version '" + loaded_game_id + "' is missing from the cache.")

        setStatus("Fetching template (≈7 MB)", 0)
        if (!window.templates) {
            await new Promise((resolve, reject) => {
                var s = document.createElement('script');
                s.type = 'text/javascript';
                s.src = "single_file.js"; // THICC FILE
                s.async = true;
                s.onload = resolve;
                s.onerror = () => reject(new Error("Could not load the portable player template (single_file.js). Check your connection and try again."));
                document.body.appendChild(s);
            })
        }

        setStatus("Filling template", 30)
        const game_uri = await getDataURIFromBlob(game)

        const zip = new JSZip()
        for (const file_name of Object.keys(window.templates)) {
            zip.file(file_name, fillPortableTemplate(window.templates[file_name], game_uri, loaded_game_id))
        }
        setStatus("Zipping", 70)
        const blob = await zip.generateAsync({type: "blob"}, (meta) => setStatus(undefined, 70 + meta.percent * 0.25))
        saveAs(blob, "balatro_" + safeFileName(loaded_game_id) + "_portable.zip")
    })

    save_download.onclick = guarded(async function() {
        setStatus("Reading save data", 20)
        const blob = await exportSave(loaded_game_id)
        if (!blob) {
            showMessage("No save data yet", "There is no save data for '" + loaded_game_id + "' yet. Click Play and play for a bit first.")
            return
        }
        setStatus("Downloading", 90)
        saveAs(blob, "balatro_" + safeFileName(loaded_game_id) + "_save_data.zip")
    })

    // Pick the file before entering the guarded (busy) section, so a picker that
    // never reports cancellation can't leave the page stuck in the busy state.
    const upload_save = guarded(async function(file) {
        setStatus("Reading zip", 20)
        const records = await parseSaveZip(file)

        setStatus("Checking current save", 50)
        const existing = await readSaveFiles(loaded_game_id)
        if (Object.keys(existing).length > 0) {
            if (!confirm("Replace the current save data for '" + loaded_game_id + "'? Download it first if you want a backup.")) {
                return
            }
        }

        setStatus("Writing save data", 80)
        await writeSaveRecords(loaded_game_id, records)
        return "Save data uploaded"
    })

    save_upload.onclick = async function() {
        if (busy) return
        const file = await pickZipFile()
        if (file) await upload_save(file)
    }

    save_delete.onclick = guarded(async function() {
        if (!confirm("Delete ALL save data for version '" + loaded_game_id + "'? This cannot be undone.")) {
            return
        }

        setStatus("Deleting save data", 50)
        await clearSaveFiles(loaded_game_id)
        return "Save data deleted"
    })
}

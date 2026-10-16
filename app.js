function $(id) {
    return document.getElementById(id)
}

/**
 *
 * @param {Blob | File} blob
 * @returns {Promise<String>}
 */
function getDataURIFromBlob(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Could not read the file."));
        reader.readAsDataURL(blob);
    });
}

/**
 * Ask the browser not to evict our IndexedDB data (built games and saves)
 * when the device is low on storage. Best-effort; some browsers ignore it.
 */
async function requestPersistentStorage() {
    try {
        if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
            await navigator.storage.persist()
        }
    } catch (err) {
        console.warn("Persistent storage request failed", err)
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const file_input = $("exeInput")

    const load_exe_radio = $("loadExeRadio")
    const load_vanilla_radio = $("loadVanillaRadio")

    const add_mods_button = $("addModDir")
    const clear_mods_button = $("clearMods")
    const use_lovely_dump_button = $("useLovelyDump")

    const version_name_input = $("makeName")

    const build_button = $("parseBtn")

    add_mods_button.onclick = guarded(addModDir)
    clear_mods_button.onclick = clearMods
    use_lovely_dump_button.onclick = guarded(useLovelyDump)
    renderModsList()

    if (!window.showDirectoryPicker) {
        add_mods_button.disabled = true
        use_lovely_dump_button.disabled = true
        $("modSupportHint").hidden = false
    }

    function checkBuildButton() {
        if (file_input.files.length > 0 && load_exe_radio.checked) {
            build_button.disabled = false;
        } else if (load_vanilla_radio.checked) {
            build_button.disabled = false;
        } else {
            build_button.disabled = true;
        }
    }

    const drop_zone = $("dropZone")

    function formatSize(bytes) {
        return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB"
    }

    function updateDropZone() {
        const file = file_input.files[0]
        drop_zone.classList.toggle("has-file", !!file)
        drop_zone.classList.toggle("dimmed", load_vanilla_radio.checked)
        $("dropTitle").textContent = file ? file.name : "Drop Balatro.exe here"
        $("dropSub").textContent = file ? formatSize(file.size) + " · click to choose another" : "or click to browse (.exe or .love)"
    }

    function onSourceChange() {
        updateDropZone()
        checkBuildButton()
    }

    file_input.onchange = function() {
        // Choosing a file implies building from it.
        if (file_input.files.length > 0) load_exe_radio.checked = true
        onSourceChange()
    }
    load_exe_radio.onchange = onSourceChange
    load_vanilla_radio.onchange = onSourceChange

    // Drag and drop onto the drop zone.
    const hasFiles = (event) => event.dataTransfer && Array.from(event.dataTransfer.types || []).includes("Files")
    let drag_depth = 0
    drop_zone.addEventListener("dragenter", (event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        drag_depth++
        drop_zone.classList.add("dragging")
    })
    drop_zone.addEventListener("dragleave", () => {
        drag_depth = Math.max(0, drag_depth - 1)
        if (drag_depth == 0) drop_zone.classList.remove("dragging")
    })
    drop_zone.addEventListener("drop", (event) => {
        drag_depth = 0
        drop_zone.classList.remove("dragging")
        const files = event.dataTransfer && event.dataTransfer.files
        if (!files || files.length == 0 || file_input.disabled) return
        file_input.files = files
        file_input.onchange()
    })
    // Don't let a file dropped next to the zone replace the page.
    window.addEventListener("dragover", (event) => {
        if (hasFiles(event)) event.preventDefault()
    })
    window.addEventListener("drop", (event) => {
        if (hasFiles(event)) event.preventDefault()
    })

    build_button.onclick = guarded(async function() {
        build_button.disabled = true
        file_input.disabled = true;
        version_name_input.disabled = true;

        try {
            let file;
            if (load_exe_radio.checked) {
                file = file_input.files[0]
                if (!file) throw new Error("Choose your Balatro.exe or .love file first.")
            } else {
                file = await loadCachedGame()
                if (!file) throw new Error("The 'vanilla' version is missing. Build it from Balatro.exe first.")
            }

            // An empty name falls back to the placeholder ("vanilla", or "Modded" when mods are added).
            const name = (version_name_input.value || version_name_input.placeholder).trim()

            if (!name) {
                throw new Error("No name provided for the build.")
            }

            const has_mods = Object.keys(mods).length > 0
            const exists = (await listCachedVersions()).indexOf(name) != -1

            if (has_mods && name == "vanilla") {
                if (!confirm("Overwrite the 'vanilla' build with a modded one? \"Use Vanilla\" builds will then include these mods too.")) {
                    return
                }
            } else if (exists) {
                if (!confirm("A version named '" + name + "' already exists. Overwrite it? Its save data is kept.")) {
                    return
                }
            } else if (!has_mods && name != "vanilla") {
                if (!confirm("Create an unmodded version called '" + name + "'? This is only useful as an extra save slot. Use the name 'vanilla' to enable \"Use Vanilla\" for modded builds.")) {
                    return
                }
            }

            const game = await buildFromSource(file, mods);

            setStatus("Saving to cache", 95)
            await saveGameToCache(game, name);
            await requestPersistentStorage()

            await renderVersionList()
            await loadVersion(name)

            return "Built '" + name + "'. Click Play to start."
        } finally {
            file_input.disabled = false;
            version_name_input.disabled = false;
            checkBuildButton()
        }
    })

    try {
        const versions = await listCachedVersions()
        await renderVersionList()

        // Returning visitors: pre-load the last used version (or the only one).
        const remembered = getRememberedVersion()
        const initial = versions.indexOf(remembered) != -1 ? remembered : versions.length == 1 ? versions[0] : null
        if (initial) await loadVersion(initial)

        setStatus(versions.length == 0 ? "Ready. Choose your Balatro.exe to get started." : "Ready")
    } catch (err) {
        console.error(err)
        setStatus("Could not read cached versions")
        showError(err instanceof Error ? err.message : String(err))
    }
})

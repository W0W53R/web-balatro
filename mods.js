/**
 * 
 * @param {FileSystemDirectoryHandle} dir 
 * @returns {Promise<boolean>}
 */
async function isMod(dir) {
    try {
        await dir.getFileHandle("lovely.toml")
        return true
    } catch {
        try {
            await dir.getDirectoryHandle("lovely")
            return true
        } catch {
            return false
        }
    }
}

/**
 * @param {FileSystemDirectoryHandle} dir - A mod's root folder.
 * @returns {Promise<boolean>} Whether the mod declares itself web compatible.
 */
async function isWebCompatible(dir) {
    try {
        await dir.getFileHandle("webcompatible")
        return true
    } catch {
        return false
    }
}

/**
 * 
 * @param {FileSystemDirectoryHandle} dir
 * @returns {Promise<Object>}
 */
async function directoryToObject(dir) {
    const object = {}
    for await (const [path, obj] of dir.entries()) {
        if (obj.kind == "directory") {
            object[path] = await directoryToObject(obj)
        } else {
            object[path] = await obj.getFile()
        }
    }
    return object
}

let mods = {}

async function addModDir() {
    /** @type {FileSystemDirectoryHandle} */
    const dir_picker = await showDirectoryPicker({
        mode: "read",
        startIn: "downloads"
    });

    // Either a single mod folder, or a folder of mods (like Lovely's Mods folder).
    const mod_dirs = []
    if (await isMod(dir_picker)) {
        mod_dirs.push(dir_picker)
    } else {
        for await (const obj of dir_picker.values()) {
            // Not only Lovely mods: SMODS-only mods are needed when using a Lovely dump.
            if (obj.kind == "directory") {
                mod_dirs.push(obj)
            }
        }
    }

    if (mod_dirs.length == 0) {
        throw new Error("No mods found in '" + dir_picker.name + "'. Pick a mod folder (containing lovely.toml or a lovely folder), or a folder of mod folders.")
    }

    const untested = []
    for (const dir of mod_dirs) {
        setStatus("Reading mod " + dir.name)
        mods[dir.name] = await directoryToObject(dir)
        if (!await isWebCompatible(dir)) untested.push(dir.name)
    }

    $("makeName").placeholder = "Modded"
    renderModsList()

    if (untested.length > 0) {
        showMessage("Mods may not work", "These mods aren't marked as web compatible and may not work: " + untested.join(", ") + ". Mods that need SMODS won't work.")
    }
}

function clearMods() {
    mods = {}
    $("makeName").placeholder = "vanilla"
    renderModsList()
}

function removeMod(mod_name) {
    delete mods[mod_name]
    if (Object.keys(mods).length == 0) {
        $("makeName").placeholder = "vanilla"
    }
    renderModsList()
}

function renderModsList() {
    const list = $("mod-list");
    list.innerHTML = "";

    const count = Object.keys(mods).length;
    const badge = $("modCount");
    if (badge) {
        badge.hidden = count == 0;
        badge.textContent = count;
        badge.setAttribute("aria-label", count + (count == 1 ? " mod" : " mods"));
    }
    if (count > 0 && $("modsDetails")) $("modsDetails").open = true;

    if (count == 0) {
        const empty = document.createElement("span");
        empty.className = "hint";
        empty.innerText = "None. The build will be unmodded.";
        list.appendChild(empty);
        return;
    }
    for (const mod_name of Object.keys(mods)) {
        const row = document.createElement("div");
        row.className = "mod-item";

        const mod_item = document.createElement("label");
        mod_item.innerText = mod_name;


        if (mods["Dump from Lovely"] && mod_name != "Dump from Lovely") {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = "dont_patch.txt" in mods[mod_name];
            checkbox.onchange = function() {
                if (checkbox.checked) {
                    mods[mod_name]["dont_patch.txt"] = new File(["true"], "dont_patch.txt", { type: "text/plain" })
                } else {
                    delete mods[mod_name]["dont_patch.txt"]
                }
            }
            mod_item.prepend(checkbox);
            mod_item.title = "Tick if this mod was part of the Lovely dump";
        }

        row.appendChild(mod_item);

        const remove = document.createElement("button");
        remove.innerText = "Remove";
        remove.setAttribute("aria-label", "Remove " + mod_name);
        remove.onclick = () => removeMod(mod_name);
        row.appendChild(remove);

        list.appendChild(row);
    }
}

async function useLovelyDump() {
    // Open a folder picker
    const dir_picker = await showDirectoryPicker({
        mode: "read",
        startIn: "downloads"
    });

    mods["Dump from Lovely"] = await directoryToObject(dir_picker)
    $("makeName").placeholder = "Modded"

    renderModsList()

    showMessage("Lovely dump added", "Tick the checkbox next to each mod that was included in the dump, so its patches aren't applied twice.")
}
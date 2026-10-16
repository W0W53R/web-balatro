function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function string_searchAll(string, regex) {
    regex = regex.toString().replace(/\/(.*)\/g/, "$1")
    const positions = []

    let nextRegex = regex
    while (true) {
        const result = string.search(new RegExp(nextRegex))
        if (result == -1) {
            break
        }
        nextRegex = ".{" + result + ",}?" + regex
        positions.push(result)
    }
    return positions
}

/**
 * 
 * @param {Blob | File} blob .zip or .exe of balatro
 * @param {Object<string, Object>} mods Nested object of mods
 * @returns {Promise<Blob>} .zip of patched source
 */
async function buildFromSource(blob, mods) {
    const progress_bar = $("progressBar")
    const status_text = $("status")

    progress_bar.value = "0"
    status_text.innerText = "Finding Source"

    const buffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // Balatro.exe is the LÖVE runtime with the game's .love (a zip) appended,
    // so find the first local file header ("PK\x03\x04"). A .love file starts with one.
    let start = -1
    for (let i = 0; i + 3 < bytes.length; i++) {
        if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) {
            start = i
            break
        }
    }
    if (start == -1) {
        throw new Error("'" + (blob.name || "That file") + "' doesn't contain any game data. Choose Balatro.exe from the game's install folder, or a .love file.")
    }

    progress_bar.value = "30"
    const pkfile = buffer.slice(start)

    /**
     * 
     * @param {string} path A file path
     * @returns {Promise<string>} Contents of file
     */
    function get_file(path) {
        const file = zipfile.file(path)
        if (!file) {
            throw new Error("A mod tried to patch '" + path + "', which doesn't exist in this version of the game.")
        }
        return file.async("string")
    }

    /**
     * 
     * @param {string} path A file path
     * @returns {Promise<string>} Contents of file
     */
    function get_mod_file(mod, path) {
        let current = mods[mod]
        const chunks = path.split("/")
        for (const chunk of chunks) {
            current = current && current[chunk]
        }
        if (!(current instanceof Blob)) {
            throw new Error("Mod '" + mod + "' references '" + path + "', which is missing from the mod folder.")
        }
        /** @type {File} */
        const file = current;
        return file.text()
    }

    /**
     * 
     * @param {string} path Path to file
     * @param {string} data Contents of file
     */
    function set_file(path, data) {
        let current = zipfile
        for (const chunk of path.split("/").slice(0, -1)) {
            current = current.folder(chunk)
        }
        current.file(path.split("/").at(-1), data)
    }

    progress_bar.value = "40"
    status_text.innerText = "Extracting zip"
    let zipfile
    try {
        zipfile = await JSZip.loadAsync(new Blob([pkfile]))
    } catch (err) {
        console.error(err)
        throw new Error("Couldn't read the game data in '" + (blob.name || "that file") + "'. Make sure it's an unmodified Balatro.exe or .love file.")
    }
    if (!zipfile.file("main.lua") || !zipfile.file("globals.lua")) {
        throw new Error("'" + (blob.name || "That file") + "' doesn't look like Balatro. Choose Balatro.exe from the game's install folder, or a .love file.")
    }

    // THE TYPE!
    /** @type {Array<{name: string, src: {manifest: {version: string, dump_lua: boolean, priority: number}, patches: {pattern: {target: string, pattern: string, position: 'before'|'at'|'after', payload: string, match_indent: boolean}, regex: {target: string, pattern: string, position: string, line_prepend: string, payload: string}, module: {source: string, before: string, name: string}, copy: {target: string, position: string, sources: string[]}}[]}, vars: [Object<String, String>] }>} */
    const patch_list = [];

    // Replace source with patched data from external tool.
    function parseLovelyDump(obj, path) {
        for (const [name, value] of Object.entries(obj)) {
            if (!(value instanceof File)) {
                parseLovelyDump(value, path + name + "/");
                continue;
            }
            set_file(path + name, value)
        }
    }

    if (mods["Dump from Lovely"]) {
        parseLovelyDump(mods["Dump from Lovely"], "")
    }

    // Mods go here
    for (const [name, mod] of Object.entries(mods)) {
        if (name == "Dump from Lovely") {
            continue // Skip LovelyDump, it is handled separately
        }

        const tomls = []
        if (mod["lovely.toml"]) {
            tomls.push({
                toml: mod["lovely.toml"],
                path: "lovely.toml"
            })
        }
        if (mod["lovely"]) {
            for (const [name, patch] of Object.entries(mod["lovely"])) {
                if (name.endsWith(".toml")) {
                    tomls.push({
                        toml: patch,
                        path: "lovely/" + name
                    })
                }
            }
        }
        for (const file of tomls) {
            try {
                const src = toml.parse(await file.toml.text())
                src.manifest = src.manifest || {}
                src.patches = src.patches || []
                patch_list.push({
                    src: src,
                    name: name,
                    dont_patch: mod["dont_patch.txt"] ? true : false,
                })
            } catch (err) {
                console.error("Failure while parsing mod " + name + " file " + file.path)
                console.error(err)
            }
        }
    }

    patch_list.sort((a, b) => {
        const pa = a.src.manifest.priority || 0
        const pb = b.src.manifest.priority || 0
        return pa > pb ? -1 : pa == pb ? 0 : 1
    })

    let modules_to_load = {}

    for (const patch_data of patch_list) {
        status_text.innerText = "Applying mod " + patch_data.name
        const vars = patch_data.vars || {}

        function do_vars(string) {
            for (const [key, value] of Object.entries(vars)) {
                string = string.replaceAll(`{{lovely:${key}}}`, value)
            }
            return string
        }


        for (const block of patch_data.src.patches) {

            let do_vars_on = [block]

            // TODO: Do vars

            // while (do_vars_on.length > 0) {
            //     const current = do_vars_on.pop()
            //     for (const [key, value] of Object.entries(current)) {
            //         if (typeof value == "string") {
            //             current[key] = do_vars(value)
            //         } else if (typeof value == "object" && value !== null) {
            //             do_vars_on.push(value)
            //         }
            //     }
            // }



            if (block.pattern && !patch_data.dont_patch) {
                const patch = block.pattern
                patch.limit = patch.limit || Infinity

                let contents = await get_file(patch.target)
                if (patch.position == "at") {
                    contents = contents.replace(patch.pattern, patch.payload)
                } else if (patch.position == "before") {
                    contents = contents.replace(patch.pattern, patch.payload + " " + patch.pattern)
                } else {
                    contents = contents.replace(patch.pattern, patch.pattern + " " + patch.payload)
                }

                set_file(patch.target, contents)
            }
            if (block.regex && !patch_data.dont_patch) {
                const patch = block.regex
                patch.limit = patch.limit || Infinity
                patch.line_prepend = patch.line_prepend || ""
                patch.payload = patch.line_prepend + patch.payload.replace("\n", "\n" + patch.line_prepend)

                const pattern = new RegExp(patch.pattern, "g")

                let contents = await get_file(patch.target)

                let locs = []
            
                let data;
                while ((data = pattern.exec(contents)) !== null) {
                    locs.push({
                        index: data.index,
                        index_groups: data.slice(1),
                        groups: data.groups ?? {},
                        match: data[0]
                    })
                }
                
                let delta = 0;
                
                let i = 0
                for (const match of locs) {

                    if (i > patch.limit) {
                        break
                    }
                    i++

                    let replacer = patch.payload;
                    let original_size = match.match.length;
                    for (let i = 0; i < match.index_groups.length; i++) {
                        replacer = replacer.replaceAll("$" + (i + 1), match.index_groups[i])
                    }
                    for (const [key, value] of Object.entries(match.groups)) {
                        replacer = replacer.replaceAll("$" + key, value)
                    }

                    if (patch.position == "at") {
                        contents = contents.slice(0, match.index + delta) + replacer + contents.slice(match.index + delta + original_size)
                        delta += replacer.length - original_size
                    } else if (patch.position == "before") {
                        contents = contents.slice(0, match.index + delta) + replacer + contents.slice(match.index + delta)
                        delta += replacer.length
                    } else {
                        contents = contents.slice(0, match.index + delta + original_size) + replacer + contents.slice(match.index + delta + original_size)
                        delta += replacer.length
                    }
                }

                set_file(patch.target, contents)
            }
            if (block.copy && !patch_data.dont_patch) {
                const patch = block.copy
                let contents = await get_file(patch.target)
                if (patch.position == "before") {
                    for (const file of patch.sources) {
                        const source_contents = await get_mod_file(patch_data.name, file)

                        contents = "-- " + patch_data.name + " - " + file + "\n" + source_contents + "\n" + contents
                    }
                } else {
                    for (const file of patch.sources) {
                        const source_contents = await get_mod_file(patch_data.name, file)

                        contents += "\n-- " + patch_data.name + " - " + file + "\n" + source_contents
                    }
                }
                set_file(patch.target, contents)
            }
            if (block.module) {
                // Even though the patch specifies 'load module BEFORE other file'
                // We load it after to prevent missing objects.

                const patch = block.module

                const file_name = patch.name.replace(".", "/") + ".lua"

                // Create module file to load from
                set_file(file_name, await get_mod_file(patch_data.name, patch.source))

                if (!patch_data.dont_patch) {
                    // Add import statement for module to load it.
                    modules_to_load[patch.before] = modules_to_load[patch.before] || []
                    modules_to_load[patch.before].push(patch.name)
                }
            }
        }
    }

    for (const [path, module] of Object.entries(modules_to_load)) {
        let contents = await get_file(path)
        for (const to_require of module) {
            contents += `\nrequire '${to_require}'`
        }
        set_file(path, contents)
    }

    // Move every mod into the 'Mods' folder
    function move_dir(dir, path) {
        for (const [name, file] of Object.entries(dir)) {
            if (!(file instanceof File)) {
                zipfile.folder(path + name)
                move_dir(file, path + name + "/")
            } else {
                zipfile.file(path + name, file)
            }
        }
    }

    const mods_without_dump = {}

    for (const [mod_name, mod_data] of Object.entries(mods)) {
        if (mod_name != "Dump from Lovely") {
            mods_without_dump[mod_name] = mod_data
        }
    }

    move_dir(mods_without_dump, "Mods/")

    progress_bar.value = "50"
    status_text.innerText = "Applying Patches"
    
    for (const patch_file of Object.keys(window.patches)) {
        zipfile.file(patch_file, window.patches[patch_file])
    }

    // If source has been patched already, and it hasn't been overwritten by a dump, skip patching.
    if (!zipfile.file("web_patched") || mods["Dump from Lovely"]) {
        progress_bar.value = "60"

        {
            const main = zipfile.file("main.lua")
            let contents = await main.async("string")
            contents = 'require "web_patches"\n' + contents
            contents = contents.replace("if os == 'OS X' or os == 'Windows' then", "if false then")
            contents = contents.replace("G:start_up()", "G:start_up()\n    G.SOUND_MANAGER = { channel = { push = function() end } }")
            zipfile.file("main.lua", contents)
        }

        progress_bar.value = "70"

        {
            const contents = await zipfile.file("globals.lua").async("string")
            zipfile.file("globals.lua", contents.replace("F_SOUND_THREAD = true", "F_SOUND_THREAD = false"))
        }

        progress_bar.value = "80"

        {
            const contents = await zipfile.folder("resources").folder("shaders").file("hologram.fs").async("string")
            zipfile.folder("resources").folder("shaders").file("hologram.fs", contents.replace(/glow_samples;/g, "4;"))
        }


        zipfile.file("web_patched", "true")
    }

    progress_bar.value = "90"

    status_text.innerText = "Zipping zip"
    const game = await zipfile.generateAsync({ type: "blob" })
    progress_bar.value = "100"
    status_text.innerText = "Done"

    return game
}
/**
 * @param {string} version - The name of the version to run.
 */
function runVersion(version) {
    loadCachedGame(version).then(
        /**
         * 
         * @param {Blob} game - The zip data of the game
         */
        async (game) => {
            const PREFIX = "Balatro_" + version + "_";

            const originalOpen = indexedDB.open;
            const originalDeleteDatabase = indexedDB.deleteDatabase;

            indexedDB.open = function(name, version) {
                const prefixedName = PREFIX + name;
                return version !== undefined
                ? originalOpen.call(this, prefixedName, version)
                : originalOpen.call(this, prefixedName);
            };

            indexedDB.deleteDatabase = function(name) {
                const prefixedName = PREFIX + name;
                return originalDeleteDatabase.call(this, prefixedName);
            };

            document.body.innerHTML = ""
            const canvas = document.createElement("canvas")
            canvas.id = "canvas"
            document.body.appendChild(canvas)
            document.body.classList.add("game")

            setupClipboardBridge()

            const data = new Uint8Array(await game.arrayBuffer())

            Module = window.Module || {}
            Module.INITIAL_MEMORY = 268435456
            Module.canvas = canvas
            Module.printErr = console.error
            Module.arguments = ["game.love"] // 1st argument is the path of the package
            Module.preRun = [
                function () { // Load game.love into the fs
                    Module.addRunDependency("fp game.love");
                    var ptr = Module.getMemory(data.length);
                    Module['HEAPU8'].set(data, ptr); // Put data after the chunk of memory
                    Module.FS_createDataFile('/', "game.love", data, true, true, true); // Add the file
                    Module.removeRunDependency("fp game.love");
                }
            ]
            // The package exports the Love function
            var s = document.createElement('script');
            s.type = 'text/javascript';
            s.src = "run/11.5/love.min.js";
            s.async = true;
            s.onload = function () {
                Love(Module);
            };
            document.body.appendChild(s);
        },
        (error) => {
            throw new Error("Unknown game version '" +version + "'")
        }
    )
}
/**
 * love.js keeps the clipboard inside the wasm module, so copying and pasting never
 * reach the browser. The Lua side (web_patches.lua) sends requests through
 * love.system.openURL, which calls window.open, and reads the browser clipboard
 * from a file that this function keeps up to date.
 */
function setupClipboardBridge() {
    const CLIPBOARD_FILE = "web_clipboard.txt" // In the root of the emscripten FS
    const BRIDGE_PREFIX = "web-balatro:"

    let lastText = ""
    let lastPasteEvent = 0

    function writeClipboardFile(text) {
        if (typeof text !== "string") text = lastText
        lastText = text
        if (!Module.FS_createDataFile) return
        try { Module.FS_unlink("/" + CLIPBOARD_FILE) } catch (e) { }
        try {
            Module.FS_createDataFile("/", CLIPBOARD_FILE, new TextEncoder().encode(text), true, true, true)
        } catch (e) {
            console.error("Could not write clipboard file", e)
        }
    }

    function fallbackCopy(text) {
        const active = document.activeElement
        const area = document.createElement("textarea")
        area.value = text
        area.setAttribute("readonly", "")
        area.style.position = "fixed"
        area.style.opacity = "0"
        document.body.appendChild(area)
        area.select()
        try { document.execCommand("copy") } catch (e) { }
        area.remove()
        if (active && active.focus) active.focus()
    }

    function writeBrowserClipboard(text) {
        writeClipboardFile(text)
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => fallbackCopy(text))
        } else {
            fallbackCopy(text)
        }
    }

    function readBrowserClipboard() {
        // Ctrl+V already delivered the text through the paste event
        if (Date.now() - lastPasteEvent < 1000 || !(navigator.clipboard && navigator.clipboard.readText)) {
            writeClipboardFile(lastText)
            return
        }
        navigator.clipboard.readText().then(
            (text) => writeClipboardFile(text),
            () => writeClipboardFile(lastText)
        )
    }

    // SDL cancels the keydown of Ctrl+V, which stops the browser from firing the
    // paste event. Let the browser's paste go through (the game still gets the key).
    window.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && (event.code === "KeyV" || event.key === "v" || event.key === "V")) {
            event.preventDefault = () => { }
        }
    }, true)

    // Ctrl+V / Cmd+V: the text arrives here before the game handles the key press
    document.addEventListener("paste", (event) => {
        const text = event.clipboardData && event.clipboardData.getData("text/plain")
        if (typeof text === "string") {
            lastPasteEvent = Date.now()
            writeClipboardFile(text)
        }
        event.preventDefault()
    })

    // Tell the game the bridge is here (see web_patches.lua). The file system is
    // only available once love.js has started, so wait for it.
    const markerTimer = setInterval(() => {
        if (!(window.Module && Module.FS_createDataFile && Module.calledRun)) return
        clearInterval(markerTimer)
        try {
            Module.FS_createDataFile("/", "web_bridge_ready", new Uint8Array([49]), true, true, true)
        } catch (e) { }
    }, 50)

    const originalOpen = window.open
    window.open = function (url, ...rest) {
        if (typeof url === "string" && url.startsWith(BRIDGE_PREFIX)) {
            const body = url.slice(BRIDGE_PREFIX.length)
            const split = body.indexOf(":")
            const command = split === -1 ? body : body.slice(0, split)
            let arg = ""
            try { arg = split === -1 ? "" : decodeURIComponent(body.slice(split + 1)) } catch (e) { }

            if (command === "clipboard-write") writeBrowserClipboard(arg)
            else if (command === "clipboard-read") readBrowserClipboard()
            return null
        }
        return originalOpen.call(this, url, ...rest)
    }
}

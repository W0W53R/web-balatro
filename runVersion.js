/**
 * @param {string} version - The name of the version to run.
 */
async function runVersion(version) {
    /** @type {Blob | null} */
    const game = await loadCachedGame(version).catch(() => null)
    if (!game) {
        throw new Error("Unknown game version '" + version + "'")
    }

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

    const data = new Uint8Array(await game.arrayBuffer())

    if (window.stopBackground) window.stopBackground()
    document.body.innerHTML = ""
    document.body.classList.remove("busy")
    document.title = "Balatro (" + version + ")"

    // Shown until the game paints over it (the canvas is transparent until then).
    const loading = document.createElement("p")
    loading.id = "loading"
    loading.textContent = "Loading Balatro…"
    document.body.appendChild(loading)

    const canvas = document.createElement("canvas")
    canvas.id = "canvas"
    document.body.appendChild(canvas)
    document.body.classList.add("game")

    Module = window.Module || {}
    Module.INITIAL_MEMORY = 268435456
    Module.canvas = canvas
    Module.printErr = console.error
    Module.arguments = ["game.love"] // 1st argument is the path of the package
    Module.onAbort = function (what) {
        console.error("Game aborted:", what)
        canvas.remove()
        loading.textContent = "The game crashed. Reload the page to try again; your last autosave is kept."
    }
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
        Promise.resolve(Love(Module)).catch(function (err) {
            console.error(err)
            if (!canvas.isConnected) return // Already reported by onAbort.
            canvas.remove()
            loading.textContent = "The game failed to start: " + (err && err.message ? err.message : err)
        })
    };
    s.onerror = function () {
        loading.textContent = "Could not load the game engine. Reload the page and try again."
    };
    document.body.appendChild(s);
}

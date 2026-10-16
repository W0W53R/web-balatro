function $(id) {
    return document.getElementById(id)
}

const make = document.createElement.bind(document)

const SUITS = [
    { symbol: "♠", name: "spades", className: "suit-dark" },
    { symbol: "♥", name: "hearts", className: "suit-red" },
    { symbol: "♣", name: "clubs", className: "suit-dark" },
    { symbol: "♦", name: "diamonds", className: "suit-red" },
]

/** A stable suit for each version name, purely decorative. */
function suitFor(name) {
    let hash = 0
    for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0
    return SUITS[hash % SUITS.length]
}

/** Highlight the row of the currently loaded version (if any). */
function highlightLoadedVersion() {
    for (const item of $("versionsList").children) {
        if (!item.dataset.version) continue
        const is_loaded = typeof loaded_game_id !== "undefined" && item.dataset.version === loaded_game_id
        item.classList.toggle("loaded-row", is_loaded)
        const state = item.querySelector(".version-state")
        if (state) state.textContent = is_loaded ? "Loaded" : "Ready to load"
        if (is_loaded) {
            item.setAttribute("aria-current", "true")
        } else {
            item.removeAttribute("aria-current")
        }
    }
}

/**
 * Re-render the list of cached versions.
 */
async function renderVersionList() {
    const versions = await listCachedVersions()
    const versionsList = $("versionsList")
    versionsList.innerHTML = ""

    // First visit: the page shows only the build panel and the steps.
    document.body.classList.toggle("no-versions", versions.length == 0)

    {
        const load_vanilla_radio = $("loadVanillaRadio")
        const has_vanilla = versions.indexOf("vanilla") != -1
        load_vanilla_radio.disabled = !has_vanilla
        $("vanillaHint").hidden = has_vanilla
        if (!has_vanilla && load_vanilla_radio.checked) {
            // Don't leave a now-impossible option selected.
            $("loadExeRadio").checked = true
            $("loadExeRadio").dispatchEvent(new Event("change"))
        }
    }

    if (versions.length == 0) {
        const li = make("li")
        li.className = "empty"
        li.innerText = "No versions yet. Build one to get started."
        versionsList.appendChild(li)
        return
    }

    for (const version of versions) {
        const li = make("li")
        li.dataset.version = version

        const suit = suitFor(version)
        const card = make("span")
        card.className = "suit " + suit.className
        card.textContent = suit.symbol
        card.setAttribute("aria-hidden", "true")
        li.appendChild(card)

        const name = make("span")
        name.className = "version-name"
        const title = make("strong")
        title.innerText = version
        const state = make("span")
        state.className = "version-state"
        state.textContent = "Ready to load"
        name.append(title, state)
        li.appendChild(name)

        const actions = make("span")
        actions.className = "version-actions"

        const loadButton = make("button")
        loadButton.className = "btn btn-blue btn-sm"
        loadButton.onclick = guarded(async function() {
            await loadVersion(version)
        })
        loadButton.innerText = "Load"
        loadButton.setAttribute("aria-label", "Load " + version)
        actions.appendChild(loadButton)

        const delButton = make("button")
        delButton.innerText = "Delete"
        delButton.className = "btn btn-danger btn-sm"
        delButton.setAttribute("aria-label", "Delete " + version)
        delButton.onclick = guarded(async function() {
            if (confirm("Delete the version '" + version + "'? Its save data is kept and will come back if you build a version with the same name. Use Save data → Delete to remove it.")) {
                await deleteCachedGame(version)
                if (version === loaded_game_id) {
                    await loadVersion(null)
                }
                await renderVersionList()
            }
        })
        actions.appendChild(delButton)

        li.appendChild(actions)
        versionsList.appendChild(li)
    }
    highlightLoadedVersion()
}

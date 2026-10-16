/**
 * Shared UI helpers: status line, error dialog, and a wrapper that gives
 * long-running button handlers consistent busy / error behaviour.
 */

function setStatus(text, progress) {
    const status_text = document.getElementById("status")
    const progress_bar = document.getElementById("progressBar")
    if (text !== undefined && status_text) status_text.innerText = text
    if (progress !== undefined && progress_bar) {
        progress_bar.value = progress
        progress_bar.setAttribute("aria-valuetext", (text || "") + " " + Math.round(progress) + "%")
    }
}

let busy = false
let lastFocused = null

function showDialog(title, message, kind) {
    const modal = document.getElementById("errorModal")
    document.getElementById("errorTitle").textContent = title
    document.getElementById("errorMessage").textContent = message
    modal.classList.toggle("info", kind === "info")
    if (modal.classList.contains("hidden")) lastFocused = document.activeElement
    modal.classList.remove("hidden")
    document.getElementById("closeModal").focus()
}

function showError(message) {
    showDialog("Error", message, "error")
}

/** Show a non-error notice in the same dialog. */
function showMessage(title, message) {
    showDialog(title, message, "info")
}

function hideError() {
    document.getElementById("errorModal").classList.add("hidden")
    if (lastFocused && lastFocused.focus) lastFocused.focus()
    lastFocused = null
}

document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("errorModal")
    document.getElementById("closeModal").addEventListener("click", hideError)
    modal.addEventListener("click", (event) => {
        if (event.target === modal) hideError()
    })
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !modal.classList.contains("hidden")) hideError()
    })
})

/** True when the user dismissed a browser file/folder picker. */
function isAbort(err) {
    return !!err && err.name === "AbortError"
}

/**
 * Wrap a button handler so that it:
 *  - ignores re-entry while another guarded action is running,
 *  - marks the page busy (see `body.busy` in style.css),
 *  - silently ignores picker cancellation,
 *  - reports any other failure in the error dialog,
 *  - always resets the progress bar and status line afterwards. If `fn`
 *    resolves to a string, it is shown as the final status instead of "Ready".
 *
 * @param {Function} fn
 */
function guarded(fn) {
    return async function (...args) {
        if (busy) return
        busy = true
        let failed = false
        let result
        document.body.classList.add("busy")
        try {
            result = await fn.apply(this, args)
            return result
        } catch (err) {
            if (!isAbort(err)) {
                failed = true
                console.error(err)
                setStatus("Failed")
                showError(err instanceof Error ? err.message : String(err || "Something went wrong."))
            }
        } finally {
            busy = false
            document.body.classList.remove("busy")
            if (!failed) setStatus(typeof result === "string" ? result : "Ready")
            setStatus(undefined, 0)
        }
    }
}

/**
 * Ask the user for a .zip file. Uses a plain <input type=file>, which works in
 * every browser and reports cancellation instead of throwing.
 *
 * @returns {Promise<File | null>}
 */
function pickZipFile() {
    return new Promise((resolve) => {
        const input = document.createElement("input")
        input.type = "file"
        input.accept = ".zip,application/zip"
        input.onchange = () => resolve(input.files[0] || null)
        input.oncancel = () => resolve(null)
        input.click()
    })
}

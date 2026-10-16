# Balatro On The Web

Run the card game [Balatro](https://www.playbalatro.com/) in your browser using the [love.js](https://github.com/2dengine/love.js) runtime and **your own copy of the game**.

**Play it here: <https://awest813.github.io/web-balatro/>**

This site doesn't include Balatro. You give it the `Balatro.exe` (or `.love`) file from your own install. Everything runs locally: your game files and saves stay in your browser and are never uploaded anywhere.

## Usage

1. Find `Balatro.exe` in your install folder. In Steam, right click Balatro → *Manage* → *Browse local files*. See [whereisexe.html](whereisexe.html) for macOS and other platforms.
2. On the site, drop the file onto the page (or click to choose it), leave the name as `vanilla`, and click **Build**. This only has to be done once; the build is cached in your browser.
3. Click **Play**.

Next time you visit, your last version is already loaded, so you can go straight to **Play**.

A recent desktop browser works best. Adding mods needs a Chromium-based browser (Chrome, Edge, Opera, etc.), because it uses the folder picker.

## Saves

- Each version has its own save, stored in your browser's IndexedDB. The game writes it to storage every 10 seconds, when the tab is hidden, and when the page is closed.
- **Save Data → Download** exports a zip backup. **Upload** restores one, and also accepts a zip of your desktop save folder (`%AppData%\Balatro` on Windows). See [whereisexe.html#saves](whereisexe.html#saves).
- Clearing this site's data in your browser deletes your saves. Download a backup first.

## Running locally

The project has no build step. Clone the repo and serve the folder with any static web server:

```sh
python -m http.server
```

Then open <http://localhost:8000>. Opening `index.html` as a `file:` URL may also work, but some browsers block features the site needs on `file:` URLs.

## Deploying to GitHub Pages

The workflow in [`.github/workflows/static.yml`](.github/workflows/static.yml) publishes the repository as-is on every push to `main`.

1. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`, or run the *Deploy static content to Pages* workflow from the **Actions** tab.

The site only uses relative paths, so it works from a project subpath such as `https://<user>.github.io/web-balatro/`.

## Troubleshooting

- **"doesn't contain any game data" / "doesn't look like Balatro"**: choose `Balatro.exe` itself (not a shortcut or the Steam launcher), or a `.love` file.
- **Odd colors or shader glitches**: some GPUs and drivers run the WebGL shaders differently. Try another browser.
- **Out of storage**: each build can take 100 MB or more of browser storage. Delete versions you don't use.
- **Game crashed**: reload the page. Your save from the last autosave is kept.

## Limitations

The RNG generator on the web differs from the native RNG implementation, so seeded runs will differ from their native counterparts.

## Mods

Some mods work, such as [Handy](https://github.com/SleepyG11/HandyBalatro). Some modification to the mod may be required.

Mods that require SMODS will not function as SMODS isn't compatible.

A common issue with mod-web compatibility is the .toml file's multiline quotes. The web parser parses `''''` differently than the Lovely .toml parser. To fix it, add a space to separate the four quotes, such as `' '''`.

Add an empty file named `webcompatible` to a mod's folder to mark it as tested on the web, which hides the compatibility warning.

### Possible SMODS workaround

The **Use Lovely Dump** button can be used to support SMODS. When Lovely applies mods to native Balatro, it creates a dump of every file it modified. **Use Lovely Dump** patches the game with that dump, instead of patching it with this site's own mod loader. This lets SMODS run after removing some LuaJIT-only features, such as `goto`. SMODS works with some editing.

## Portable Builder

When a version is loaded, the **Make Portable** button is available. It creates and downloads a zip file with everything needed to run Balatro in 3 files. The zip file is about 150 MiB.

To use the portable player, extract the zip archive and open `index.html` as a `file:` URL, or with a static file server. It takes a couple of seconds to load.

Don't put the portable player on the internet: it contains Balatro's source, and distributing it is illegal.

## Working Features

- Main gameplay loop
- Sound
- Saves (with autosave, import and export)
- Simple Mod Support

## Planned Features

- Full mod support
- Specifically the 'SMODS' mod, the main mod injector that most other mods use.
- More accurate RNG.

## Credits

[love.js](https://github.com/2dengine/love.js) by 2dengine (Library)

[Balatro](https://www.playbalatro.com/) by LocalThunk. This project is not affiliated with LocalThunk or Playstack.

[Lovely](https://github.com/ethangreen-dev/lovely-injector) by Ethan Green

[Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) font by the Pixelify Sans Project Authors, under the [SIL Open Font License](fonts/OFL.txt)

Originally created by [W0W53R](https://github.com/W0W53R/web-balatro).

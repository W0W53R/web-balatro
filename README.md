# Balatro On The Web

Run the classic card game 'Balatro' on the web using the [love.js](https://github.com/2dengine/love.js) runtime.

## Installation

This project does not need to be built, so installation is as simple as using `git clone` or downloading the source from github.

## Usage

Open index.html, either through a static web server, or as a file: url, provide the Balatro.exe file, name it 'vanilla', and click 'Build'. Once it finishes, scroll down and click 'Load' by the vanilla entry in the 'Versions' table. Click 'Start Game' and Balatro will launch, fully in the browser. 

If the 'index.html' file fails when using the file: url, use a static web server such as python's http.server module.
```sh
python -m http.server
```

## Limitations

The RNG generator on the web differes from the native RNG implementation, so seeded runs will differ to the native counterparts.

Some computers run the internal WebGL shaders differently and may result in odd color effects.

Versions built before copy/paste support was added need to be rebuilt to get it.

## Caching

The site will cache each built version in IndexedDB, and each version will have its own save, also located in IndexedDB.

## Mods

Some mods work, such as [Handy](https://github.com/SleepyG11/HandyBalatro). Some modification to the mod may be required.

Mods that require SMODS will not function as SMODS isn't compatible.

A common issue with mod-web compatibility is the .toml file's multiline quotes. The web parser parses "''''" differently than the Lovely .toml parser. To fix, just add a space to seperate the four quotes, such as "' '''"

### Possible SMODS workaround

The 'Use Lovely Dump' button can be used to support SMODS. The Lovely mod loader, when used to apply mods to native Balatro will create a dump of all files modified in the process. The 'Use Lovely Dump' uses the dump to patch the files, instead of patching the files using my version of the mod loader. This allows SMODS to run after removing some LuaJIT only features, such as 'goto'. SMODS does work with some editing.

## Portable Builder

When a version is loaded, the 'Make Portable' button is available. The button creates and downloads a zip file which contains everything needed to run Balatro in 3 files. The zip file is 150 MiB.

To use the portable player, extract the zip archive and open index.html as a file: URL, or with a static file server. It will take a couple seconds to load.

Don't put the portable player on the internet because it contains Balatro's source and that would be illegal to distribute.

## Working Features

- Main gameplay loop
- Sound
- Saves
- Copy and paste using the browser clipboard: 'Copy' and 'Paste Seed' buttons, plus Ctrl+V (Cmd+V) in text boxes
- Simple Mod Support

## Planned Features

- Full mod support
- Specifically the 'SMODS' mod, the main mod injector that most other mods use.
- More accurate RNG.

## Credits

[love.js](https://github.com/2dengine/love.js) by 2dengine (Library)

[Balatro](https://www.playbalatro.com/) by LocalThunk

[Lovely](https://github.com/ethangreen-dev/lovely-injector) by Ethan Green
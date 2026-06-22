# Taskbar Groups (Electron prototype)

Group several app shortcuts into a single button you pin to the Windows 11
taskbar. Clicking the button opens a small flyout above the taskbar with all
the shortcuts in that group — a modern take on tjackenpacken/taskbar-groups.

## Run it (development)

You need Node.js installed (the LTS build from nodejs.org is fine).

```
cd taskbar-groups
npm install
npm start
```

The config window opens, and a tray icon appears (bottom-right, near the clock).
The tray icon means the app is running in the background — that's what makes
the popups appear instantly when you click a pinned group.

## How to use it

1. Click **New group**, give it a name, and **Add shortcut** for each program
   (point it at the program's `.exe` or its existing `.lnk` shortcut).
2. Optionally pick an image for the group's taskbar icon and an accent color.
3. Click **Save & pin**. Explorer opens on the generated shortcut.
4. **Drag that shortcut onto your taskbar** to pin it.
5. Click the pinned button — the group's flyout appears above the taskbar.
   Click any tile to launch it.

Pinning is a manual drag because Windows has no official "pin to taskbar" API —
the original Taskbar Groups works the same way.

## How it works (the short version)

- One background process stays alive (the tray icon). It holds a single-instance
  lock.
- Each pinned button is a normal Windows shortcut whose target is this app, with
  an argument like `--group=g123`.
- When you click it, Windows launches the app again; the already-running process
  catches that launch, reads the group id, and shows the flyout. The second
  launch then exits. That hand-off is why the popup is fast.
- Icons in the flyout come from Windows itself (`app.getFileIcon`), so they match
  what you'd see in Explorer.

## Build a Windows installer (later)

```
npm run dist
```

This uses electron-builder to produce an `.exe` installer in `dist/`. Once
installed, the shortcuts point at the installed app instead of the dev build,
so they keep working after you close VS Code.

## Known rough edges (this is a v1 prototype)

- First-ever click after a reboot is slightly slower until the tray process is
  running. Opening the app once (or adding it to startup) keeps clicks instant.
- The auto-generated group icon is a flat color square unless you choose an
  image. A future version can compose a mini-grid of the contained app icons,
  like the original does.
- Shortcut reordering, drag-and-drop, and multiple-monitor edge cases aren't
  handled yet.

# Taskbar Groups

Group multiple app shortcuts into a single button on your Windows 11 taskbar. Click it and a small flyout opens just above the taskbar with everything in that group — pick one and it launches.

A fresh, modern take on the long‑abandoned [Taskbar Groups](https://github.com/tjackenpacken/taskbar-groups), rebuilt from scratch for Windows 11.

<!-- Add a screenshot: drop an image into the repo (e.g. screenshot.png) and uncomment the line below -->
<!-- ![Taskbar Groups](screenshot.png) -->

## Features

- Bundle any apps, files, or folders into one taskbar button
- A clean flyout that appears above the taskbar and closes when you click away
- A custom icon per group — pick any image and it's auto‑cropped and rounded — or just a solid accent color
- Adjustable grid size for the popup
- Shortcut icons pulled straight from Windows, so they match what you see in Explorer
- Runs quietly in the system tray, so groups open instantly

## Install

1. Download the latest installer from the [Releases page](https://github.com/Q-atastrophe/Taskbar-Groups/releases).
2. Run it. The app isn't code‑signed, so Windows SmartScreen will show a "Windows protected your PC" warning — click **More info → Run anyway**. It's safe, just unsigned.
3. Launch Taskbar Groups. It also lives in your system tray.

## Usage

1. Click **New group** and give it a name.
2. **Add shortcut** for each app you want in the group (point it at the program's `.exe` or its shortcut).
3. Optionally choose an icon and an accent color.
4. Click **Save**, then **Pin to taskbar** — Explorer opens on the group's shortcut.
5. Drag that shortcut onto your taskbar. Click it any time to open the group.

> **Tip:** Set a group's icon *before* you pin it. Windows takes a snapshot of the icon at the moment you pin, so changing it afterward means unpinning and re‑pinning.

## Build from source

Requires [Node.js](https://nodejs.org).

```bash
git clone https://github.com/Q-atastrophe/Taskbar-Groups.git
cd Taskbar-Groups
npm install
npm start        # run in development
npm run dist     # build a Windows installer into dist/
```

## Built with

[Electron](https://www.electronjs.org/) · Windows 11

## License

[MIT](LICENSE)

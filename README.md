# Anime Image Viewer

> [!WARNING]
> This app is under active development. Please back up your data before use.

A desktop app for organizing and browsing anime image collections. Built with Go (Wails) and React.


## Download

Download executables for Windows or Linux from the [release page](https://github.com/michael-freling/anime-image-viewer/releases).


## Features

### Anime Management
- Browse your collection in a responsive masonry grid with adjustable sizing (XS/S/M/L)
- Organize anime with hierarchical seasons, parts, and episodes
- Link anime to [AniList](https://anilist.co) for automatic metadata import (titles, airing info, covers)
- Import full season chains via BFS traversal of sequel/prequel relationships

### Image Organization
- Tag-based and character-based image organization (separate systems)
- Multi-image selection via click, Shift+click, Ctrl+click, Ctrl+A, or rubber-band drag
- Bulk edit tags and characters across selected images
- Import images with tags from DigiKam XMP sidecar files
- Delete images with confirmation

### Image Viewer
- Full-screen overlay with keyboard navigation
- Zoom and pan with double-click toggle
- Open images in OS default viewer or reveal in file explorer

### Search
- Filter images by anime, tags, and characters
- Combine include/exclude tag filters

### Backup and Settings
- Configurable automatic idle backups with retention policies
- Manual backup/restore with optional image inclusion
- Customizable directories for images, config, logs, and backups


## Development

See [docs/development.md](./docs/development.md) for development setup and guidelines.

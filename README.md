# Anime image viewer

> [!WARNING]
> This app is still under development and there are a lot of missing features and performance bottlenecks.
> Please take a backup on your data for safety when you use this app.

This is a desktop app for browsing anime images.
Take a look at a next video and get an idea of what you can do by this app!

[![Watch the Demo](https://img.youtube.com/vi/OculrxRpfJI/hqdefault.jpg)](https://www.youtube.com/embed/OculrxRpfJI)

> The sources of the images in the above Demo,
> - https://x.com/oshinoko_global/status/1874291958866231761/photo/1
> - https://x.com/AniTrendz/status/1739087701499150632/photo/1


> [!NOTE]
> Despite this is developed for organizing anime images, currently, there is no feature specific to anime images.


## Download

You can download executable files on Windows or Linux on a [release page](https://github.com/michael-freling/anime-image-viewer/releases).


## Features

This app provides a few features to manage anime images more efficiently, including but not limited to followings:

1. Manage images under folders
2. Manage images and folders by tags
3. Import images with tags included in sidecar XMP files managed by DigiKam
4. (Experimental) Suggest tags by a ML model

A ML model is **NOT** included in this repository, and in order to use suggested tags, at first, you need to upload images using this app and run ML trainings.
Currently, you need to run a python server by yourself to use this feature.

Besides, there are missing features and improvements listed in [./docs/TODO.md](), although there is no ETA for each.


## Development

Read [./docs/development.md] for a document related to a development.

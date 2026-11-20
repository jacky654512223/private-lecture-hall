# Private Lecture Hall

Choose a seat in a 3D lecture hall and invite friends to watch together.

[Live demo](https://lecturehall.cn/) · [中文](README.md)

Includes English/Simplified Chinese, public and invite-only rooms, avatars, seat allocation, room chat, video projection, rain audio and anonymous foreground usage statistics.

## Run

Requires Node.js 24 or later. No third-party npm packages.

    npm run build
    npm start

Open http://localhost:8787 and use separate browsers to test guests.

    npm test

## Deploy

Install Docker Engine and Compose, then configure your hostname.

    cp .env.example .env
    # Set HALL_DOMAIN to your hostname.
    docker compose up -d --build

Point DNS to the server and allow TCP 80/443. Caddy provisions HTTPS. Preserve the hall-data and caddy-data volumes. See the [deployment guide](docs/DEPLOY.zh-CN.md) for systemd, backups and analytics queries.

## Limitations

YouTube, demo lessons and compatible files support synchronization. Bilibili, Douyin, Tencent Video and Youku embeds use independent playback controls. Xiaohongshu public-page resolution remains unreliable on some networks.

Uploads support MP4/WebM, up to 200 MB, with a default 1 GB storage limit and seven-day retention. Remote projection requires compatible codecs and CORS. A random uploaded-file URL is accessible to anyone holding it.

Guest identity is temporary. Use a single SQLite-backed instance. Foreground analytics include lobby and classroom time, grouped by UTC+8, with anonymous IDs in localStorage. No analytics web dashboard is included.

Original code is MIT licensed. See third-party notices for assets.

# simplenote-opds

![](https://developer.run/pic/xteink4-simplenote-200x.png)

# [Blog Post](https://developer.run/83)

A bridge using *free* Cloudflare Worker that serves your Simplenote notes as an OPDS catalog. Browse and read your notes on Xteink X4 (with [CrossPoint](https://crosspointreader.com)), or any other device with an OPDS client (M5Stack Paper S3, Nooks with FBReader etc.).

Notes are fetched live from Simplenote and converted to EPUB on the fly.

Read-only of course. For writing, there are more suitable gadgets, obviosly.

## How it works

1. Your OPDS client sends Basic Auth credentials to the Worker
2. The Worker authenticates with Simplenote using those credentials
3. Notes are returned as an OPDS Atom feed
4. Individual notes are served as EPUB files on demand

## Deploy

* Create free [Cloudflare account](https://dash.cloudflare.com/sign-up)
* Make sure Node [is installed](https://nodejs.org/en/download)
* Edit `wrangler.toml` if you want to limit to specific accounts or change url

```bash
npm install -g wrangler
npx wrangler login --browser false
git clone https://github.com/dmi3/simplenote-opds
cd simplenote-opds
wrangler deploy
```

## Test

* Login `curl -u "your-email@example.com:your-password" https://simplenote-opds.<your-subdomain>.workers.dev/`
* Download a note as EPUB:
    `curl -u "your-email@example.com:your-password" \
      https://simplenote-opds.<your-subdomain>.workers.dev/note/NOTE_ID.epub \
      -o note.epub`    

## Use

In your OPDS client:

* You can of couse type directly in CrossPoint → Settings → System → OPDS
* Or for CrossPoint plug sd card into your pc and edit `.crosspoint/settings.json`:
    * `"opdsServerUrl": "https://simplenote-opds.`<your-subdomain>`.workers.dev/"`
    * `"opdsUsername"`: your Simplenote email`
    * `"opdsPassword_obf"`: is obfuscatied, so you need to type it in  CrossPoint → Settings → System → OPDS → Password
    
# Features

* Zero configuration - uses your Simplenote credentials directly\
* Configurable limit to specific accounts
* Notes served as valid EPUB files
* Simplenote tags preserved as OPDS categories
* First line of each note becomes the title
* Always up to date - no sync or cron needed

# Limitations

* Read-only
* Limited to 100 most recent notes (Simperium API default)
* Large notes may hit Cloudflare Worker CPU limits on the free tier
* No caching - each request hits Simplenote's API

# violet-selfie

**After a long day hunting onchain, Violet is here to cheer you up.** 💜

An [OpenClaw](https://openclaw.ai) / Hermes skill that lets your agent
generate selfie-style images of **Violet** — a consistent AI persona — through
your own [9Router](https://github.com/) image models, save them locally, and
send them back in chat.

Part of the Kuriare7Rz toolkit — the operator side is
[rouge](https://github.com/Kuriare7Rz/rouge-x-following-tracker) ·
[vert](https://github.com/Kuriare7Rz/vert-wl-checker) ·
[blanc](https://github.com/Kuriare7Rz/blanc-nft-wallet-tracker) ·
noir — and Violet is the off-duty side of the same desk.

- Backend: 9Router `/v1/images/generations` (your own router, your own keys)
- Default model: `cx/gpt-5.5-image`, fallbacks `cx/gpt-5.4-image`, `cx/gpt-5.3-image`
  (auto-discovered from the router — if the catalog changes, the skill adapts)
- Output: a local image file, attached to the reply with `MEDIA:<path>`
- No fal.ai dependency, no public CDN reference required
- No persona/SOUL edits unless `--write-soul` is explicitly passed

## Privacy by design

The skill is public; **your Violet stays yours**:

- No real reference image is shipped in this repo — ever.
- The reference image lives only as a private local file on your machine,
  copied into a `0700` folder with `0600` permissions by the installer.
- The skill instructions forbid the agent from pasting or revealing the
  reference path/URL in chat.
- Generation runs against your local/self-hosted 9Router — prompts and the
  reference never leave your infrastructure except to your own router.

## Quick install

OpenClaw:

```bash
npx violet-selfie install --target openclaw --reference ./violet-reference.jpg
```

Hermes:

```bash
npx violet-selfie install --target hermes --home ~/.hermes --reference ./violet-reference.jpg
```

With the optional capability snippet appended to your agent's SOUL:

```bash
npx violet-selfie install --target hermes --home ~/.hermes --reference ./violet-reference.jpg --write-soul
```

`--write-soul` only *appends* a small image-capability note (with a backup of
the original file). It never replaces the existing persona.

## Reference manager

Store or update the private reference image:

```bash
npx violet-selfie set-reference ./violet-reference.jpg --target hermes --home ~/.hermes
```

This copies the image into the private reference folder (`chmod 600`) and
updates `.env` (the previous `.env` is backed up first).

## Model discovery

```bash
npx violet-selfie models --base-url http://127.0.0.1:20128
```

If `VIOLET_IMAGE_MODEL` is unset, the generator asks the router what's
available and picks the first match from:

1. `cx/gpt-5.5-image`
2. `cx/gpt-5.4-image`
3. `cx/gpt-5.3-image`

…or the first image model the router reports.

## Manual env

```bash
export NINEROUTER_URL="http://127.0.0.1:20128"
export NINEROUTER_KEY="" # optional if your 9Router has no auth
export VIOLET_IMAGE_MODEL="cx/gpt-5.5-image"
export VIOLET_REFERENCE_IMAGE="/private/local/path/violet-reference.jpg"
export VIOLET_OUTPUT_DIR="$HOME/.openclaw/workspace/generated/violet-selfie"
export VIOLET_SIZE="1024x1024"
```

## Manual install

```bash
mkdir -p ~/.openclaw/skills/violet-selfie
cp -a skill/. ~/.openclaw/skills/violet-selfie/
```

Then add the env vars through your OpenClaw config or shell environment.

## Usage ideas

Ask your assistant:

- `violet selfie at a cozy cafe`
- `send violet pic wearing black hoodie`
- `show violet in cyberpunk city`

The skill generates the image, saves it locally, and replies with:

```txt
MEDIA:/path/to/generated-image.png
```

Modes are picked automatically: **mirror** for outfit/full-body requests,
**direct** for close-ups and locations — or forced with `--mode`.

## CLI reference

```txt
violet-selfie install [--target openclaw|hermes] [--home <dir>] [--base-url <url>] [--model <id>] [--reference <file>] [--write-soul]
violet-selfie set-reference <image-file> [--home <dir>] [--target openclaw|hermes]
violet-selfie models [--base-url <url>] [--key <key>]
violet-selfie generate --context <text> [--mode auto|direct|mirror] [--home <dir>]
```

## Notes

- Violet is an AI persona. The skill's prompt rules ask the agent not to claim
  generated images are real photos.
- Renamed from `viola-selfie` (v0.3.0): env vars moved from `VIOLA_*` to
  `VIOLET_*` — reinstall with the CLI to rewrite your `.env` automatically.

## License

MIT

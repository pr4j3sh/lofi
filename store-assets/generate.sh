#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

for name in promo-small promo-marquee screenshot-popup screenshot-settings; do
  magick -background none "${name}.svg" "${name}.png"
done

identify promo-small.png promo-marquee.png screenshot-popup.png screenshot-settings.png

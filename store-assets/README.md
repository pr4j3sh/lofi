# Store assets

Chrome Web Store images. The `.svg` files are the editable sources; the `.png` files are the exports to upload.

| File | Size | Use |
| --- | --- | --- |
| `promo-small.png` | 440×280 | Small promo tile |
| `promo-marquee.png` | 1400×560 | Marquee promo tile |
| `screenshot-popup.png` | 1280×800 | Popup screenshot |
| `screenshot-settings.png` | 1280×800 | Settings screenshot |

All images are opaque PNGs and match the extension's dark theme.

## Regenerate

Requires [ImageMagick](https://imagemagick.org/) (`magick`):

```bash
./store-assets/generate.sh
```

Edit the corresponding `.svg` file to change copy, colors, or layout, then regenerate.

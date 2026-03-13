# Friends Badge - E-Paper Badge Writer

Web app for designing and sending images to e-paper badges over BLE (Bluetooth Low Energy).

## Features

- **Template editor** with six layouts: Conference, Minimal, Developer, Social, QR Code, Mix
- **Mix layout editor** with draggable text blocks and optional QR code
- **Image upload** with crop-to-fit and dithering (Floyd-Steinberg, Atkinson, Stucki)
- **Color palettes**: Black/White/Yellow/Red (BWYR), Black/White/Red (BWR), Black/White (BW)
- **BLE writing** via Web Bluetooth API to compatible e-paper badges
- **Download** badge designs as PNG

## Supported Hardware

- TAG_SR9837 (Highlight TX) — 3.7" 240×416 4-color (BWYR) e-paper badge
- Other e-paper badges using Nordic UART Service (NUS) with the 0xA5 display protocol

## Usage

1. Open `index.html` in Chrome or Edge (Web Bluetooth required)
2. Activate the badge by reading its NFC tag
3. Design your badge using the template editor or upload an image
4. Click **Connect Badge** and select your badge from the BLE device list
5. Click **Write to Badge** to send the image

## BLE Communication

### Connection

The app connects via Web Bluetooth to devices with name prefix `TAG`. Communication uses the Nordic UART Service (NUS):

| Role | UUID |
|------|------|
| **Service** | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` |
| **Write** (TX) | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` |
| **Notify** (RX) | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` |

The Write characteristic sends commands and data to the badge. The Notify characteristic receives acknowledgements from the badge. A 5-second timeout applies when waiting for responses.

### 0xA5 Protocol

All packets start with `0xA5`. There are two packet types:

**Command packet** (4 bytes):

```
┌──────┬──────┬──────┬──────────┐
│ 0xA5 │ 0x00 │ cmd  │ checksum │
└──────┴──────┴──────┴──────────┘
```

**Data packet** (variable length):

```
┌──────┬────────┬──────┬────────────┬──────────┬──────────┬────────────┬──────────┐
│ 0xA5 │ length │ 0x12 │ planeIndex │ addr_hi  │ addr_lo  │ data[0..N] │ checksum │
└──────┴────────┴──────┴────────────┴──────────┴──────────┴────────────┴──────────┘
```

- `length` = data length + 3 (accounts for planeIndex + 2 address bytes)
- Address is big-endian (high byte first), representing the byte offset into the image plane
- Maximum data chunk size: 220 bytes

**Checksum**: Sum of all bytes from index 1 onward, masked to `0xFF`.

### Commands

| Command | Code | Description |
|---------|------|-------------|
| Handshake | `0x11` | Initialize connection. Badge responds with `[..., 0x11, 0x00]` at byte positions 2–3 |
| Data | `0x12` | Send image data chunk with plane index and address |
| CRC Verify | `0x13` | Verify data integrity after all chunks are sent |
| Display | `0x14` | Trigger e-paper refresh to show the image |

### Transfer Sequence

```
App                              Badge
 │                                 │
 ├── Handshake (0x11) ───────────► │
 │ ◄──────────── ACK (0x11,0x00) ──┤
 │                                 │
 ├── Data chunk 0 (0x12) ────────► │
 ├── Data chunk 1 (0x12) ────────► │
 ├── ...                           │
 ├── Data chunk N (0x12) ────────► │
 │                                 │
 ├── CRC Verify (0x13) ──────────► │
 │ ◄──────────────────────── ACK ──┤
 │                                 │
 ├── Display (0x14) ─────────────► │
 │ ◄──────────────────────── ACK ──┤
 │                                 │
```

Data is sent plane by plane. For multi-plane formats (BWR has 2 planes), the `planeIndex` field identifies which plane the chunk belongs to.

## Image Format

### Supported Sizes

| Size | Display |
|------|---------|
| 240×416 | 3.7" (default for TAG_SR9837) |
| 296×152 | 2.9" |
| 296×128 | 2.6" |

### Pixel Encoding

**BWYR** (4-color) — 2 bits per pixel, column-major layout:
- 4 horizontal pixels packed per byte
- Index formula: `(x / 4) * height + y`
- Color values: `00` = black, `01` = white, `10` = yellow, `11` = red

**BWR** (3-color) — 1 bit per pixel per plane, column-major Y-flipped layout:
- 8 horizontal pixels packed per byte
- Index formula: `(x / 8) * height + (height - 1 - y)`
- Two planes: BW plane (black/white) + Red plane (red pixels)

**BW** (2-color) — 1 bit per pixel, column-major Y-flipped layout:
- 8 horizontal pixels packed per byte
- Index formula: `(x / 8) * height + (height - 1 - y)`
- Two planes sent: BW plane + zeroed second plane

**Note:** The TAG badge (240×416) always uses BWYR encoding regardless of the selected palette. The palette choice only affects which colors are available during dithering.

## Files

- `index.html` — UI with badge preview, template editor, image upload, and BLE controls
- `badge.js` — rendering, dithering, image conversion, and BLE communication
- `insp/` — reference Flutter implementation ([friends_badge](https://github.com/flutter-and-friends/friends_badge))

## Credits

Inspired by [flutter-and-friends/friends_badge](https://github.com/flutter-and-friends/friends_badge).

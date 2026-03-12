# Friends Badge - E-Paper Badge Writer

Web app for designing and sending images to e-paper badges over BLE (Bluetooth Low Energy).

## Features

- **Template editor** with four layouts: Conference, Minimal, Developer, Social
- **Image upload** with crop-to-fit and dithering (Floyd-Steinberg, Atkinson, Stucki)
- **Color palettes**: Black/White/Yellow/Red (BWYR), Black/White/Red (BWR), Black/White (BW)
- **BLE writing** via Web Bluetooth API to compatible e-paper badges
- **Download** badge designs as PNG

## Supported Hardware

- TAG_SR9837 (Highlight TX) — 3.7" 240×416 4-color (BWYR) e-paper badge
- Other e-paper badges using Nordic UART Service (NUS) with the 0xA5 display protocol

## Usage

1. Open `index.html` in Chrome or Edge (Web Bluetooth required)
2. Design your badge using the template editor or upload an image
3. Click **Connect Badge** and select your badge from the BLE device list
4. Click **Write to Badge** to send the image

## BLE Protocol

Communication uses Nordic UART Service (NUS):
- **Service**: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- **Write**: `6e400002-b5a3-f393-e0a9-e50e24dcca9e`
- **Notify**: `6e400003-b5a3-f393-e0a9-e50e24dcca9e`

The 0xA5 display protocol sequence:
1. **Handshake** (`0x11`) — initialize connection, wait for acknowledgement
2. **Data** (`0x12`) — send image data in 220-byte chunks with big-endian addressing
3. **CRC Verify** (`0x13`) — verify data integrity
4. **Display** (`0x14`) — trigger e-paper refresh

## Image Format

- **BWYR**: 2 bits per pixel, column-major layout — 4 horizontal pixels packed per byte, `index = (x / 4) * height + y`
- **BWR/BW**: 1 bit per pixel, column-major Y-flipped layout — 8 horizontal pixels packed per byte, `index = (x / 8) * height + (height - 1 - y)`

Color values (BWYR): `00` = black, `01` = white, `10` = yellow, `11` = red

## Files

- `index.html` — UI with badge preview, template editor, image upload, and BLE controls
- `badge.js` — rendering, dithering, image conversion, and BLE communication
- `insp/` — reference Flutter implementation ([friends_badge](https://github.com/flutter-and-friends/friends_badge))

## Credits

Inspired by [flutter-and-friends/friends_badge](https://github.com/flutter-and-friends/friends_badge).

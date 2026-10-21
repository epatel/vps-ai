# Issue #125: Update project drop

Increase max file size to 200MB. Also, add possibility to pair desktop to desktop with just code (enter).

## Status: Done

- Upload limit 200MB: `MAX_UPLOAD_SIZE` (server), client checks in desktop + PWA, nginx `client_max_body_size 205M` (live config reloaded + `nginx.conf.example`).
- Uploads stream to `uploads/.tmp/` then move into the room dir (no 200MB in-memory buffer); temp file removed on 413/errors.
- Desktop pairing screen: "or join another device" code field (Enter or Pair button) + "Back to shared items" when already paired. Paste/drop are ignored while the pairing screen is shown.
- Server `pair` handler detaches the joining socket from its previous placeholder room.
- Tests: added desktop-to-desktop pairing + upload-limit tests; fixed pre-existing failing `test_delete_item` (didn't drain sender echo). 8/8 server, 10/10 db.

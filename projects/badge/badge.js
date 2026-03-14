// Friends Badge - E-Paper Badge Writer
// Web app for designing and sending images to e-paper badges via BLE

(function () {
  'use strict';

  // ─── Configuration ───
  const BADGE_SPECS = {
    '240x416': { width: 240, height: 416, label: '3.7"' },
    '296x152': { width: 296, height: 152, label: '2.9"' },
    '296x128': { width: 296, height: 128, label: '2.6"' },
  };

  const PALETTES = {
    bw: [
      [0, 0, 0],
      [255, 255, 255],
    ],
    bwr: [
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 0],
    ],
    bwyr: [
      [0, 0, 0],
      [255, 255, 255],
      [255, 255, 0],
      [255, 0, 0],
    ],
  };
  const MIX_PADDING = 6;
  const MIX_TEXT_CHIP_PADDING_X = 6;
  const MIX_TEXT_CHIP_PADDING_Y = 4;

  // ─── Palette color helpers ───
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function hexToRgb(hex) {
    const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
  }

  function getPaletteHexColors() {
    return PALETTES[state.palette].map(([r, g, b]) => rgbToHex(r, g, b));
  }

  function snapToNearestPaletteColor(hex) {
    const [r, g, b] = hexToRgb(hex);
    const palette = PALETTES[state.palette];
    let bestDist = Infinity;
    let bestColor = palette[0];
    for (const [pr, pg, pb] of palette) {
      const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestColor = [pr, pg, pb];
      }
    }
    return rgbToHex(...bestColor);
  }

  function updateSwatchColor(swatch, hex) {
    swatch.style.background = hex;
    const itemKey = swatch.dataset.item;
    const kind = swatch.dataset.kind;
    if (state.itemColors[itemKey]) {
      state.itemColors[itemKey][kind] = hex;
    }
  }

  function buildPalettePopup(swatch) {
    const popup = swatch.querySelector('.palette-popup');
    popup.innerHTML = '';
    const colors = getPaletteHexColors();
    const currentColor = state.itemColors[swatch.dataset.item]?.[swatch.dataset.kind] || '#000000';
    colors.forEach(hex => {
      const sw = document.createElement('div');
      sw.className = 'palette-popup-swatch' + (hex === currentColor ? ' selected' : '');
      sw.style.background = hex;
      if (hex === '#000000' || hex === '#000') {
        sw.style.border = '2px solid #555';
        if (hex === currentColor) sw.style.borderColor = 'var(--accent)';
      }
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        updateSwatchColor(swatch, hex);
        popup.classList.remove('open');
        swatch.classList.remove('active-pick');
        if (state.mode === 'template') render();
      });
      popup.appendChild(sw);
    });
  }

  function refreshAllSwatches() {
    document.querySelectorAll('.item-color-swatch').forEach(swatch => {
      const itemKey = swatch.dataset.item;
      const kind = swatch.dataset.kind;
      if (state.itemColors[itemKey]) {
        const snapped = snapToNearestPaletteColor(state.itemColors[itemKey][kind]);
        state.itemColors[itemKey][kind] = snapped;
        swatch.style.background = snapped;
      }
    });
    // Also snap the accent color
    state.accentColor = snapToNearestPaletteColor(state.accentColor);
    rebuildAccentRow();
  }

  function rebuildAccentRow() {
    const row = document.getElementById('accentColorRow');
    if (!row) return;
    row.innerHTML = '';
    const colors = getPaletteHexColors();
    colors.forEach(hex => {
      const btn = document.createElement('button');
      btn.className = 'color-btn' + (hex === state.accentColor ? ' active' : '');
      btn.dataset.color = hex;
      btn.style.background = hex;
      if (hex === '#000000') btn.style.border = '1px solid #555';
      btn.addEventListener('click', () => {
        row.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.accentColor = hex;
        // Sync accent-linked item color swatches
        const accentItems = ['company', 'extra'];
        accentItems.forEach((key) => {
          state.itemColors[key].text = hex;
          const swatch = document.getElementById(key + 'TextColor');
          if (swatch) swatch.style.background = hex;
        });
        render();
      });
      row.appendChild(btn);
    });
  }

  // ─── State ───
  const state = {
    template: 'conference',
    name: 'Flutter Dev',
    title: 'Mobile Engineer',
    company: 'Flutter & Friends',
    extra: '@flutterdev',
    qrContent: '',
    qrScalePercent: 50,
    accentColor: '#ff0000',
    itemColors: {
      name:    { text: '#000000', bg: '#ffffff' },
      title:   { text: '#000000', bg: '#ffffff' },
      company: { text: '#ff0000', bg: '#ffffff' },
      extra:   { text: '#ff0000', bg: '#ffffff' },
    },
    palette: 'bwyr',
    dither: 'floydSteinberg',
    sizeKey: '240x416',
    orientation: 'portrait',
    mixLayout: {},
    templateBackgroundImage: null,
    uploadedImage: null,
    mode: 'template', // 'template' or 'image'
    bleDevice: null,
    bleCharacteristic: null,
    bleNotifyCharacteristic: null,
    connected: false,
  };

  // ─── Elements ───
  const canvas = document.getElementById('badgeCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const badgeOverlay = document.getElementById('badgeOverlay');

  // ─── Dithering Algorithms ───
  const DITHER_KERNELS = {
    floydSteinberg: {
      matrix: [
        [1, 0, 7 / 16],
        [-1, 1, 3 / 16],
        [0, 1, 5 / 16],
        [1, 1, 1 / 16],
      ],
    },
    atkinson: {
      matrix: [
        [1, 0, 1 / 8],
        [2, 0, 1 / 8],
        [-1, 1, 1 / 8],
        [0, 1, 1 / 8],
        [1, 1, 1 / 8],
        [0, 2, 1 / 8],
      ],
    },
    stucki: {
      matrix: [
        [1, 0, 8 / 42],
        [2, 0, 4 / 42],
        [-2, 1, 2 / 42],
        [-1, 1, 4 / 42],
        [0, 1, 8 / 42],
        [1, 1, 4 / 42],
        [2, 1, 2 / 42],
        [-2, 2, 1 / 42],
        [-1, 2, 2 / 42],
        [0, 2, 4 / 42],
        [1, 2, 2 / 42],
        [2, 2, 1 / 42],
      ],
    },
    none: null,
  };

  function findClosestColor(r, g, b, palette) {
    let minDist = Infinity;
    let closest = palette[0];
    for (const c of palette) {
      const dr = r - c[0];
      const dg = g - c[1];
      const db = b - c[2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < minDist) {
        minDist = dist;
        closest = c;
      }
    }
    return closest;
  }

  function ditherImage(imageData, palette, kernelName) {
    const { width, height, data } = imageData;
    const pixels = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) pixels[i] = data[i];

    const kernel = DITHER_KERNELS[kernelName];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = Math.max(0, Math.min(255, pixels[idx]));
        const g = Math.max(0, Math.min(255, pixels[idx + 1]));
        const b = Math.max(0, Math.min(255, pixels[idx + 2]));

        const [nr, ng, nb] = findClosestColor(r, g, b, palette);

        data[idx] = nr;
        data[idx + 1] = ng;
        data[idx + 2] = nb;
        data[idx + 3] = 255;

        if (kernel) {
          const er = r - nr;
          const eg = g - ng;
          const eb = b - nb;

          for (const [dx, dy, factor] of kernel.matrix) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = (ny * width + nx) * 4;
              pixels[nIdx] += er * factor;
              pixels[nIdx + 1] += eg * factor;
              pixels[nIdx + 2] += eb * factor;
            }
          }
        }
      }
    }
    return imageData;
  }

  // ─── Badge Rendering ───
  function getSpec() {
    const spec = BADGE_SPECS[state.sizeKey];
    if (state.orientation === 'landscape') {
      return { width: spec.height, height: spec.width, label: spec.label };
    }
    return { ...spec };
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  }

  function drawImageCover(img, width, height) {
    const imgRatio = img.width / img.height;
    const targetRatio = width / height;

    let sx;
    let sy;
    let sw;
    let sh;

    if (imgRatio > targetRatio) {
      sh = img.height;
      sw = sh * targetRatio;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      sw = img.width;
      sh = sw / targetRatio;
      sx = 0;
      sy = (img.height - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  }

  function getMixLayoutKey() {
    return `${state.sizeKey}:${state.orientation}`;
  }

  function getMixLayoutBucket() {
    const key = getMixLayoutKey();
    if (!state.mixLayout[key]) {
      state.mixLayout[key] = {};
    }
    return state.mixLayout[key];
  }

  function setMixItemPosition(key, x, y) {
    const layout = getMixLayoutBucket();
    layout[key] = { x, y };
  }

  function getMixQrContent() {
    return state.qrContent.trim();
  }

  function getQrScaleFraction() {
    return state.qrScalePercent / 100;
  }

  function shouldSkipDithering() {
    return state.template === 'qrcode' || (state.template === 'mix' && !!getMixQrContent());
  }

  function buildQrCode(content) {
    if (!content) return null;

    const qr = qrcode(0, 'L');
    qr.addData(content);
    qr.make();
    return qr;
  }

  function getMixQrItem(spec, qr) {
    if (!qr) return null;

    const { width, height } = spec;
    const moduleCount = qr.getModuleCount();
    const minimumQrSize = moduleCount * 2;
    const targetSize = Math.round(width * getQrScaleFraction());
    const size = Math.max(
      minimumQrSize,
      Math.min(width - MIX_PADDING * 2, height - MIX_PADDING * 2, targetSize),
    );
    const layout = getMixLayoutBucket();

    return {
      key: 'qr',
      label: 'QR Code',
      kind: 'qr',
      size,
      x: layout.qr?.x ?? Math.round((width - size) / 2),
      y: layout.qr?.y ?? height - size - MIX_PADDING,
    };
  }

  function getMixTextItems(spec) {
    const { width, height } = spec;
    const isPortrait = height > width;
    const ic = state.itemColors;
    const layout = getMixLayoutBucket();

    const defaults = isPortrait
      ? [
          {
            key: 'company',
            label: 'Company',
            text: state.company,
            kind: 'text',
            x: 12,
            y: 16,
            maxWidth: width - 24,
            fontSize: 16,
            font: 'bold 16px sans-serif',
            color: ic.company.text,
            bgColor: ic.company.bg,
          },
          {
            key: 'name',
            label: 'Name',
            text: state.name,
            kind: 'text',
            x: 12,
            y: 58,
            maxWidth: width - 24,
            fontSize: 34,
            font: 'bold 34px sans-serif',
            color: ic.name.text,
            bgColor: ic.name.bg,
          },
          {
            key: 'title',
            label: 'Title',
            text: state.title,
            kind: 'text',
            x: 12,
            y: 104,
            maxWidth: width - 24,
            fontSize: 18,
            font: '18px sans-serif',
            color: ic.title.text,
            bgColor: ic.title.bg,
          },
          {
            key: 'extra',
            label: 'Extra',
            text: state.extra,
            kind: 'text',
            x: 12,
            y: 138,
            maxWidth: width - 24,
            fontSize: 16,
            font: '16px sans-serif',
            color: ic.extra.text,
            bgColor: ic.extra.bg,
          },
        ]
      : [
          {
            key: 'company',
            label: 'Company',
            text: state.company,
            kind: 'text',
            x: 12,
            y: 12,
            maxWidth: width - 24,
            fontSize: 14,
            font: 'bold 14px sans-serif',
            color: ic.company.text,
            bgColor: ic.company.bg,
          },
          {
            key: 'name',
            label: 'Name',
            text: state.name,
            kind: 'text',
            x: 12,
            y: 40,
            maxWidth: width - 24,
            fontSize: 28,
            font: 'bold 28px sans-serif',
            color: ic.name.text,
            bgColor: ic.name.bg,
          },
          {
            key: 'title',
            label: 'Title',
            text: state.title,
            kind: 'text',
            x: 12,
            y: 78,
            maxWidth: width - 24,
            fontSize: 16,
            font: '16px sans-serif',
            color: ic.title.text,
            bgColor: ic.title.bg,
          },
          {
            key: 'extra',
            label: 'Extra',
            text: state.extra,
            kind: 'text',
            x: 12,
            y: 108,
            maxWidth: width - 24,
            fontSize: 14,
            font: '14px sans-serif',
            color: ic.extra.text,
            bgColor: ic.extra.bg,
          },
        ];

    return defaults.map((item) => ({
      ...item,
      ...(layout[item.key] || {}),
    }));
  }

  function getMixDraggableItems(spec) {
    const items = getMixTextItems(spec);
    const qr = buildQrCode(getMixQrContent());
    const qrItem = getMixQrItem(spec, qr);

    if (qrItem) items.unshift(qrItem);
    return items;
  }

  function renderTemplate() {
    const spec = getSpec();
    canvas.width = spec.width;
    canvas.height = spec.height;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, spec.width, spec.height);

    if (state.templateBackgroundImage) {
      drawImageCover(state.templateBackgroundImage, spec.width, spec.height);
    }

    // When a QR is visible, dither the background layer first so the QR and
    // foreground text can still be rendered sharply on top.
    if (state.templateBackgroundImage && shouldSkipDithering()) {
      const palette = PALETTES[state.palette];
      const backgroundImageData = ctx.getImageData(0, 0, spec.width, spec.height);
      ditherImage(backgroundImageData, palette, state.dither);
      ctx.putImageData(backgroundImageData, 0, 0);
    }

    const templates = {
      conference: renderConferenceTemplate,
      minimal: renderMinimalTemplate,
      developer: renderDeveloperTemplate,
      social: renderSocialTemplate,
      mix: renderMixTemplate,
      qrcode: renderQRCodeTemplate,
    };

    (templates[state.template] || renderConferenceTemplate)(spec);

    // Skip dithering when a QR is visible so the modules stay scannable.
    if (!shouldSkipDithering()) {
      const palette = PALETTES[state.palette];
      const imageData = ctx.getImageData(0, 0, spec.width, spec.height);
      ditherImage(imageData, palette, state.dither);
      ctx.putImageData(imageData, 0, 0);
    }
  }

  function renderConferenceTemplate(spec) {
    const { width, height } = spec;
    const accent = state.accentColor;
    const isPortrait = height > width;

    if (isPortrait) {
      // Top accent bar
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, width, 60);

      // Event name in bar
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.company, width / 2, 38);

      // Decorative line
      ctx.fillStyle = accent;
      ctx.fillRect(20, 80, width - 40, 3);

      // Name
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      fitText(ctx, state.name, width / 2, 140, width - 40, 36);

      // Title
      ctx.fillStyle = '#333333';
      ctx.font = '20px sans-serif';
      fitText(ctx, state.title, width / 2, 180, width - 40, 20);

      // Decorative element
      ctx.fillStyle = accent;
      const cx = width / 2;
      ctx.beginPath();
      ctx.arc(cx, 240, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(state.name.charAt(0).toUpperCase(), cx, 250);

      // Extra line
      ctx.fillStyle = '#555555';
      ctx.font = '16px sans-serif';
      ctx.fillText(state.extra, width / 2, 310);

      // Bottom decoration
      ctx.fillStyle = accent;
      ctx.fillRect(0, height - 40, width, 40);

      // Flutter dash
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px sans-serif';
      ctx.fillText('Flutter & Friends', width / 2, height - 16);
    } else {
      // Landscape conference
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, 8, height);

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'left';
      fitText(ctx, state.name, 24, 40, width - 48, 28);

      ctx.fillStyle = '#333333';
      ctx.font = '16px sans-serif';
      fitText(ctx, state.title, 24, 68, width - 48, 16);

      ctx.fillStyle = '#555555';
      ctx.font = '14px sans-serif';
      ctx.fillText(state.company, 24, 96);

      ctx.fillStyle = accent;
      ctx.fillRect(24, 110, width - 48, 2);

      ctx.fillStyle = '#555555';
      ctx.font = '13px sans-serif';
      ctx.fillText(state.extra, 24, height - 16);
    }
  }

  function renderMinimalTemplate(spec) {
    const { width, height } = spec;
    const isPortrait = height > width;

    if (isPortrait) {
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center';
      fitText(ctx, state.name, width / 2, height / 2 - 20, width - 40, 42);

      ctx.fillStyle = '#666666';
      ctx.font = '18px sans-serif';
      fitText(ctx, state.title, width / 2, height / 2 + 20, width - 40, 18);

      ctx.fillStyle = '#999999';
      ctx.font = '14px sans-serif';
      ctx.fillText(state.extra, width / 2, height / 2 + 50);
    } else {
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      fitText(ctx, state.name, width / 2, height / 2 - 10, width - 32, 32);

      ctx.fillStyle = '#666666';
      ctx.font = '16px sans-serif';
      fitText(ctx, state.title, width / 2, height / 2 + 18, width - 32, 16);
    }
  }

  function renderDeveloperTemplate(spec) {
    const { width, height } = spec;
    const accent = state.accentColor;
    const isPortrait = height > width;

    // Terminal-style background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    if (isPortrait) {
      // Terminal header bar
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, 32);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('  $ badge --info', 10, 22);

      // Terminal dots
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(width - 40, 16, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f5c518';
      ctx.beginPath(); ctx.arc(width - 24, 16, 5, 0, Math.PI * 2); ctx.fill();

      let y = 60;
      ctx.fillStyle = '#000000';
      ctx.font = '14px monospace';
      ctx.textAlign = 'left';

      ctx.fillText('> name:', 16, y);
      ctx.fillStyle = accent;
      ctx.font = 'bold 14px monospace';
      fitText(ctx, `  "${state.name}"`, 16, y + 22, width - 32, 14);

      y += 52;
      ctx.fillStyle = '#000000';
      ctx.font = '14px monospace';
      ctx.fillText('> role:', 16, y);
      ctx.fillStyle = '#333333';
      ctx.font = '14px monospace';
      fitText(ctx, `  "${state.title}"`, 16, y + 22, width - 32, 14);

      y += 52;
      ctx.fillStyle = '#000000';
      ctx.font = '14px monospace';
      ctx.fillText('> org:', 16, y);
      ctx.fillStyle = '#333333';
      ctx.font = '14px monospace';
      fitText(ctx, `  "${state.company}"`, 16, y + 22, width - 32, 14);

      y += 52;
      ctx.fillStyle = '#000000';
      ctx.font = '14px monospace';
      ctx.fillText('> handle:', 16, y);
      ctx.fillStyle = accent;
      ctx.font = '14px monospace';
      fitText(ctx, `  "${state.extra}"`, 16, y + 22, width - 32, 14);

      // Blinking cursor
      y += 56;
      ctx.fillStyle = '#000000';
      ctx.font = '14px monospace';
      ctx.fillText('> _', 16, y);

      // Bottom bar
      ctx.fillStyle = accent;
      ctx.fillRect(0, height - 24, width, 24);
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('flutter & friends badge v1.0', width / 2, height - 8);
    } else {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, 24);
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(' $ badge --info', 8, 17);

      ctx.fillStyle = '#000000';
      ctx.font = '13px monospace';
      let y = 48;
      ctx.fillText(`name: "${state.name}"`, 12, y);
      ctx.fillText(`role: "${state.title}"`, 12, y + 22);
      ctx.fillStyle = '#333';
      ctx.fillText(`org:  "${state.company}"`, 12, y + 44);
      ctx.fillStyle = accent;
      ctx.fillText(`${state.extra}`, 12, y + 66);
    }
  }

  function renderSocialTemplate(spec) {
    const { width, height } = spec;
    const accent = state.accentColor;
    const isPortrait = height > width;

    if (isPortrait) {
      // Large centered initial with circle
      const circleR = 50;
      const circleY = 120;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(width / 2, circleY, circleR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 52px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.name.charAt(0).toUpperCase(), width / 2, circleY + 18);

      // Name
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 30px sans-serif';
      fitText(ctx, state.name, width / 2, 210, width - 30, 30);

      // Title
      ctx.fillStyle = '#444444';
      ctx.font = '18px sans-serif';
      fitText(ctx, state.title, width / 2, 245, width - 30, 18);

      // Divider
      ctx.fillStyle = accent;
      ctx.fillRect(width / 2 - 30, 268, 60, 3);

      // Company
      ctx.fillStyle = '#333333';
      ctx.font = '16px sans-serif';
      ctx.fillText(state.company, width / 2, 300);

      // Handle with icon-like box
      ctx.fillStyle = accent;
      const handleW = ctx.measureText(state.extra).width + 24;
      const handleX = (width - handleW) / 2;
      roundRect(ctx, handleX, 330, handleW, 32, 16);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(state.extra, width / 2, 351);

      // Bottom pattern: small dots
      ctx.fillStyle = accent;
      for (let i = 0; i < 12; i++) {
        const dx = 20 + i * ((width - 40) / 11);
        ctx.beginPath();
        ctx.arc(dx, height - 24, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Landscape social
      const circleR = 30;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(50, height / 2, circleR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.name.charAt(0).toUpperCase(), 50, height / 2 + 11);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 22px sans-serif';
      fitText(ctx, state.name, 100, height / 2 - 14, width - 120, 22);
      ctx.fillStyle = '#444';
      ctx.font = '14px sans-serif';
      fitText(ctx, `${state.title} - ${state.company}`, 100, height / 2 + 8, width - 120, 14);
      ctx.fillStyle = accent;
      ctx.font = '13px sans-serif';
      ctx.fillText(state.extra, 100, height / 2 + 28);
    }
  }

  function renderMixTemplate(spec) {
    const { width, height } = spec;
    const accent = state.accentColor;
    const isPortrait = height > width;
    const qrContent = getMixQrContent();
    const qr = buildQrCode(qrContent);
    const qrItem = getMixQrItem(spec, qr);

    ctx.fillStyle = accent;
    if (isPortrait) {
      ctx.fillRect(0, 0, width, 12);
      ctx.fillRect(0, height - 12, width, 12);
    } else {
      ctx.fillRect(0, 0, 10, height);
      ctx.fillRect(width - 10, 0, 10, height);
    }

    if (qrItem) {
      const moduleCount = qr.getModuleCount();
      const cellSize = Math.max(2, Math.floor(qrItem.size / moduleCount));
      const qrSize = cellSize * moduleCount;
      const offsetX = qrItem.x + Math.floor((qrItem.size - qrSize) / 2);
      const offsetY = qrItem.y + Math.floor((qrItem.size - qrSize) / 2);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(qrItem.x, qrItem.y, qrItem.size, qrItem.size);

      ctx.fillStyle = '#000000';
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qr.isDark(row, col)) {
            ctx.fillRect(offsetX + col * cellSize, offsetY + row * cellSize, cellSize, cellSize);
          }
        }
      }
    }

    const items = getMixTextItems(spec);
    items.forEach((item) => {
      if (!item.text.trim()) return;
      drawMixTextItem(item);
    });
  }

  function renderQRCodeTemplate(spec) {
    const { width, height } = spec;
    const accent = state.accentColor;
    const isPortrait = height > width;

    // Generate QR code from dedicated qrContent field, falling back to extra field
    const qrContent = state.qrContent || state.extra || state.name || 'badge';
    const qr = buildQrCode(qrContent);

    const moduleCount = qr.getModuleCount();

    if (isPortrait) {
      // Top accent bar
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, width, 50);

      // Event name in bar
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.company, width / 2, 32);

      // Name
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      fitText(ctx, state.name, width / 2, 90, width - 40, 28);

      // Title
      ctx.fillStyle = '#444444';
      ctx.font = '16px sans-serif';
      fitText(ctx, state.title, width / 2, 116, width - 40, 16);

      // Divider
      ctx.fillStyle = accent;
      ctx.fillRect(width / 2 - 30, 132, 60, 3);

      // QR code - centered, with adequate quiet zone for scanning
      const quietZone = 4; // modules of quiet zone (QR spec requires >= 4)
      const qrAreaSize = Math.min(Math.round(width * getQrScaleFraction()), width - 20, height - 220);
      const cellSize = Math.max(3, Math.floor(qrAreaSize / (moduleCount + quietZone * 2)));
      const qrSize = cellSize * moduleCount;
      const totalQrSize = cellSize * (moduleCount + quietZone * 2);
      const qrX = (width - qrSize) / 2;
      const qrY = 150;

      // White background for QR with quiet zone
      ctx.fillStyle = '#ffffff';
      const quietPx = cellSize * quietZone;
      ctx.fillRect(qrX - quietPx, qrY - quietPx, qrSize + quietPx * 2, qrSize + quietPx * 2);

      // Draw QR modules
      ctx.fillStyle = '#000000';
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qr.isDark(row, col)) {
            ctx.fillRect(qrX + col * cellSize, qrY + row * cellSize, cellSize, cellSize);
          }
        }
      }

      // Extra text below QR
      const textY = qrY + qrSize + 28;
      ctx.fillStyle = '#555555';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.extra, width / 2, textY);

      // Bottom bar
      ctx.fillStyle = accent;
      ctx.fillRect(0, height - 30, width, 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.fillText('Scan me!', width / 2, height - 10);
    } else {
      // Landscape layout
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, 6, height);

      // QR code on the left with proper quiet zone
      const quietZoneL = 4;
      const qrAreaSize = Math.min(Math.round(width * getQrScaleFraction()), height - 16, width - 32);
      const cellSize = Math.max(2, Math.floor(qrAreaSize / (moduleCount + quietZoneL * 2)));
      const qrSize = cellSize * moduleCount;
      const qrX = 16;
      const qrY = (height - qrSize) / 2;

      const quietPxL = cellSize * quietZoneL;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(qrX - quietPxL, qrY - quietPxL, qrSize + quietPxL * 2, qrSize + quietPxL * 2);

      ctx.fillStyle = '#000000';
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qr.isDark(row, col)) {
            ctx.fillRect(qrX + col * cellSize, qrY + row * cellSize, cellSize, cellSize);
          }
        }
      }

      // Text on the right
      const textX = qrX + qrSize + 20;
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'left';
      fitText(ctx, state.name, textX, height / 2 - 20, width - textX - 12, 22);

      ctx.fillStyle = '#444444';
      ctx.font = '14px sans-serif';
      fitText(ctx, state.title, textX, height / 2 + 4, width - textX - 12, 14);

      ctx.fillStyle = '#555555';
      ctx.font = '13px sans-serif';
      ctx.fillText(state.company, textX, height / 2 + 24);

      ctx.fillStyle = accent;
      ctx.font = '12px sans-serif';
      ctx.fillText(state.extra, textX, height / 2 + 44);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function fitText(ctx, text, x, y, maxWidth, fontSize) {
    let size = fontSize;
    ctx.font = ctx.font.replace(/\d+px/, size + 'px');
    while (ctx.measureText(text).width > maxWidth && size > 8) {
      size -= 1;
      ctx.font = ctx.font.replace(/\d+px/, size + 'px');
    }
    ctx.fillText(text, x, y);
  }

  function fitTextTop(ctx, text, x, y, maxWidth, fontSize) {
    const previousBaseline = ctx.textBaseline;
    ctx.textBaseline = 'top';
    fitText(ctx, text, x, y, maxWidth, fontSize);
    ctx.textBaseline = previousBaseline;
  }

  function getFittedFontSize(ctx, text, maxWidth, fontSize) {
    let size = fontSize;
    ctx.font = ctx.font.replace(/\d+px/, size + 'px');
    while (ctx.measureText(text).width > maxWidth && size > 8) {
      size -= 1;
      ctx.font = ctx.font.replace(/\d+px/, size + 'px');
    }
    return size;
  }

  function getMixTextRenderMetrics(item) {
    const previousAlign = ctx.textAlign;
    const previousBaseline = ctx.textBaseline;
    const previousFont = ctx.font;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = item.font;
    const fittedSize = getFittedFontSize(ctx, item.text, item.maxWidth, item.fontSize);
    ctx.font = item.font.replace(/\d+px/, fittedSize + 'px');

    const metrics = ctx.measureText(item.text);
    const textWidth = Math.min(item.maxWidth, Math.ceil(metrics.width));
    const textHeight = Math.ceil(
      (metrics.actualBoundingBoxAscent || fittedSize * 0.8) +
      (metrics.actualBoundingBoxDescent || fittedSize * 0.2),
    );

    ctx.textAlign = previousAlign;
    ctx.textBaseline = previousBaseline;
    ctx.font = previousFont;

    return {
      fittedSize,
      rectX: item.x - MIX_TEXT_CHIP_PADDING_X,
      rectY: item.y - MIX_TEXT_CHIP_PADDING_Y,
      rectWidth: textWidth + MIX_TEXT_CHIP_PADDING_X * 2,
      rectHeight: textHeight + MIX_TEXT_CHIP_PADDING_Y * 2,
    };
  }

  function drawMixTextItem(item) {
    const previousAlign = ctx.textAlign;
    const previousBaseline = ctx.textBaseline;
    const previousFont = ctx.font;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const renderMetrics = getMixTextRenderMetrics(item);
    ctx.font = item.font.replace(/\d+px/, renderMetrics.fittedSize + 'px');

    ctx.fillStyle = item.bgColor || '#ffffff';
    ctx.fillRect(
      renderMetrics.rectX,
      renderMetrics.rectY,
      renderMetrics.rectWidth,
      renderMetrics.rectHeight,
    );

    ctx.fillStyle = item.color;
    ctx.fillText(item.text, item.x, item.y);

    ctx.textAlign = previousAlign;
    ctx.textBaseline = previousBaseline;
    ctx.font = previousFont;
  }

  function renderUploadedImage() {
    if (!state.uploadedImage) return;
    const spec = getSpec();
    canvas.width = spec.width;
    canvas.height = spec.height;

    const img = state.uploadedImage;
    drawImageCover(img, spec.width, spec.height);

    // Apply dithering
    const palette = PALETTES[state.palette];
    const imageData = ctx.getImageData(0, 0, spec.width, spec.height);
    ditherImage(imageData, palette, state.dither);
    ctx.putImageData(imageData, 0, 0);
  }

  function render() {
    if (state.mode === 'image' && state.uploadedImage) {
      renderUploadedImage();
    } else {
      renderTemplate();
    }
    syncBadgeOverlay();
  }

  let activeDrag = null;

  function syncBadgeOverlay() {
    const isVisible = state.mode === 'template' && state.template === 'mix';
    badgeOverlay.hidden = !isVisible;

    if (!isVisible) {
      badgeOverlay.innerHTML = '';
      return;
    }

    const items = getMixDraggableItems(getSpec());
    badgeOverlay.innerHTML = '';

    items.forEach((item) => {
      if (item.kind === 'text' && !item.text.trim()) return;

      const el = document.createElement('div');
      el.className = 'badge-draggable';
      el.dataset.item = item.key;
      el.style.zIndex = item.kind === 'qr' ? '1' : '2';

      if (item.kind === 'qr') {
        el.textContent = item.label;
        el.style.left = `${item.x}px`;
        el.style.top = `${item.y}px`;
        el.style.width = `${item.size}px`;
        el.style.height = `${item.size}px`;
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.whiteSpace = 'normal';
        el.style.textAlign = 'center';
        el.style.font = '600 12px sans-serif';
        el.style.color = '#000000';
      } else {
        const renderMetrics = getMixTextRenderMetrics(item);
        el.style.left = `${renderMetrics.rectX}px`;
        el.style.top = `${renderMetrics.rectY}px`;
        el.style.width = `${renderMetrics.rectWidth}px`;
        el.style.height = `${renderMetrics.rectHeight}px`;
        el.style.background = 'transparent';
      }

      el.addEventListener('pointerdown', (event) => {
        const bounds = badgeOverlay.getBoundingClientRect();
        const dragX = item.kind === 'qr' ? item.x : parseFloat(el.style.left);
        const dragY = item.kind === 'qr' ? item.y : parseFloat(el.style.top);
        activeDrag = {
          key: item.key,
          kind: item.kind,
          pointerId: event.pointerId,
          offsetX: event.clientX - bounds.left - dragX,
          offsetY: event.clientY - bounds.top - dragY,
        };

        el.classList.add('dragging');
        el.setPointerCapture(event.pointerId);
      });

      el.addEventListener('pointermove', (event) => {
        if (!activeDrag || activeDrag.key !== item.key || activeDrag.pointerId !== event.pointerId) return;
        updateDraggedMixItem(el, event);
      });

      const stopDrag = (event) => {
        if (!activeDrag || activeDrag.key !== item.key || activeDrag.pointerId !== event.pointerId) return;
        updateDraggedMixItem(el, event);
        activeDrag = null;
        el.classList.remove('dragging');
        render();
      };

      el.addEventListener('pointerup', stopDrag);
      el.addEventListener('pointercancel', stopDrag);

      badgeOverlay.appendChild(el);
    });
  }

  function updateDraggedMixItem(el, event) {
    const bounds = badgeOverlay.getBoundingClientRect();
    const spec = getSpec();
    const maxX = Math.max(MIX_PADDING, spec.width - el.offsetWidth - MIX_PADDING);
    const maxY = Math.max(MIX_PADDING, spec.height - el.offsetHeight - MIX_PADDING);
    const x = Math.max(MIX_PADDING, Math.min(maxX, event.clientX - bounds.left - activeDrag.offsetX));
    const y = Math.max(MIX_PADDING, Math.min(maxY, event.clientY - bounds.top - activeDrag.offsetY));

    const nextX = activeDrag.kind === 'text' ? x + MIX_TEXT_CHIP_PADDING_X : x;
    const nextY = activeDrag.kind === 'text' ? y + MIX_TEXT_CHIP_PADDING_Y : y;

    setMixItemPosition(activeDrag.key, nextX, nextY);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    renderTemplate();
  }

  // ─── BLE Communication ───
  // Nordic UART Service (NUS) UUIDs for friends_badge
  const BLE_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const BLE_WRITE_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
  const BLE_NOTIFY_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

  // Badge protocol constants (0xA5 protocol from decompiled badge firmware)
  const PROTO_START = 0xa5;
  const CMD_HANDSHAKE = 0x11;
  const CMD_DATA = 0x12;
  const CMD_CRC_VERIFY = 0x13;
  const CMD_DISPLAY = 0x14;

  // Checksum: sum of all bytes after the start byte, masked to 0xFF
  function calcChecksum(packet) {
    let sum = 0;
    for (let i = 1; i < packet.length; i++) {
      sum = (sum + packet[i]) & 0xff;
    }
    return sum;
  }

  // Build a simple command packet: [0xA5, 0x00, cmd, checksum]
  function buildCommandPacket(cmd) {
    return new Uint8Array([PROTO_START, 0x00, cmd, cmd & 0xff]);
  }

  // Build an 0xA5 data packet: [0xA5, length, 0x12, planeIndex, addrHi, addrLo, ...data, checksum]
  // Address is big-endian (high byte first)
  function buildDataPacket(planeIndex, offset, chunk) {
    const length = chunk.length + 3;
    const packet = new Uint8Array(6 + chunk.length + 1);
    packet[0] = PROTO_START;
    packet[1] = length;
    packet[2] = CMD_DATA;
    packet[3] = planeIndex;
    packet[4] = (offset >> 8) & 0xff; // high byte (big-endian)
    packet[5] = offset & 0xff;        // low byte
    packet.set(chunk, 6);
    packet[packet.length - 1] = calcChecksum(packet.subarray(0, packet.length - 1));
    return packet;
  }

  // Notification queue for awaiting badge responses
  const _notifyWaiters = [];

  function _onNotification(event) {
    const value = new Uint8Array(event.target.value.buffer);
    console.log(
      'Badge response:',
      Array.from(value)
        .map((b) => '0x' + b.toString(16).padStart(2, '0'))
        .join(' '),
    );
    if (_notifyWaiters.length > 0) {
      const waiter = _notifyWaiters.shift();
      waiter(value);
    }
  }

  function waitForNotification(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = _notifyWaiters.indexOf(wrappedResolve);
        if (idx >= 0) _notifyWaiters.splice(idx, 1);
        reject(new Error('Badge notification timeout'));
      }, timeoutMs);
      function wrappedResolve(value) {
        clearTimeout(timer);
        resolve(value);
      }
      _notifyWaiters.push(wrappedResolve);
    });
  }

  async function bleConnect() {
    try {
      setStatus('Scanning...', false);
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { 
//            services: [BLE_SERVICE_UUID],
            namePrefix: 'TAG',
           },
        ],
        optionalServices: [BLE_SERVICE_UUID],
      });

      setStatus('Connecting...', false);
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(BLE_SERVICE_UUID);
      const writeChar = await service.getCharacteristic(BLE_WRITE_UUID);

      state.bleDevice = device;
      state.bleCharacteristic = writeChar;
      state.connected = true;

      // Subscribe to notify characteristic for badge responses (required for handshake)
      const notifyChar = await service.getCharacteristic(BLE_NOTIFY_UUID);
      await notifyChar.startNotifications();
      notifyChar.addEventListener('characteristicvaluechanged', _onNotification);
      state.bleNotifyCharacteristic = notifyChar;

      device.addEventListener('gattserverdisconnected', () => {
        state.connected = false;
        state.bleDevice = null;
        state.bleCharacteristic = null;
        state.bleNotifyCharacteristic = null;
        _notifyWaiters.length = 0;
        setStatus('Disconnected', false);
        document.getElementById('bleSendBtn').disabled = true;
      });

      setStatus(`Connected: ${device.name || 'Badge'}`, true);
      document.getElementById('bleSendBtn').disabled = false;
    } catch (err) {
      if (err.name === 'NotFoundError') {
        setStatus('No device selected', false);
      } else {
        console.error('BLE error:', err);
        setStatus('Connection failed: ' + err.message, false, true);
      }
    }
  }

  async function bleSendImage() {
    if (!state.bleCharacteristic) return;

    const spec = getSpec();
    const imageData = ctx.getImageData(0, 0, spec.width, spec.height);
    const imagePlanes = convertImageToBinary(imageData, spec);

    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    progressBar.classList.add('active');

    try {
      setStatus('Handshake...', true);

      // Handshake
      await state.bleCharacteristic.writeValue(buildCommandPacket(CMD_HANDSHAKE));
      const handshakeResp = await waitForNotification(5000);
      if (handshakeResp.length < 4 || handshakeResp[2] !== 0x11 || handshakeResp[3] !== 0x00) {
        throw new Error('Handshake failed: ' + Array.from(handshakeResp).map(b => '0x' + b.toString(16)).join(' '));
      }

      setStatus('Sending image...', true);

      // Send image planes using 0xA5 data command with BIG-ENDIAN addresses
      const chunkSize = 220;
      const totalBytes = imagePlanes.reduce((sum, p) => sum + p.length, 0);
      let sentBytes = 0;

      for (let planeIndex = 0; planeIndex < imagePlanes.length; planeIndex++) {
        const planeData = imagePlanes[planeIndex];
        const totalChunks = Math.ceil(planeData.length / chunkSize);

        for (let i = 0; i < totalChunks; i++) {
          const offset = i * chunkSize;
          const chunk = planeData.slice(offset, offset + chunkSize);
          await state.bleCharacteristic.writeValue(buildDataPacket(planeIndex, offset, chunk));

          sentBytes += chunk.length;
          progressFill.style.width = ((sentBytes / totalBytes) * 100) + '%';
        }
      }

      // Verify CRC
      setStatus('Verifying...', true);
      await state.bleCharacteristic.writeValue(buildCommandPacket(CMD_CRC_VERIFY));
      await waitForNotification(5000);

      // Send display command
      setStatus('Refreshing display...', true);
      await state.bleCharacteristic.writeValue(buildCommandPacket(CMD_DISPLAY));
      await waitForNotification(5000);

      progressFill.style.width = '100%';
      setStatus('Image sent successfully!', true);
      setTimeout(() => {
        progressBar.classList.remove('active');
        progressFill.style.width = '0%';
      }, 2000);
    } catch (err) {
      console.error('Send error:', err);
      setStatus('Send failed: ' + err.message, false, true);
      progressBar.classList.remove('active');
    }
  }

  // Returns an array of planes (Uint8Array[]) matching the badge hardware format.
  // Each plane is sent separately over BLE with its planeIndex as the type byte.
  // The 3.7" TAG badge (240x416) always uses BWYR 2-bit encoding regardless of palette.
  // The palette selection only affects dithering (which colors are available).
  function convertImageToBinary(imageData, spec) {
    const { width, height, data } = imageData;

    // TAG badge (240x416) always expects BWYR format encoding
    if (width === 240 && height === 416) {
      return convertBWYR(data, width, height);
    }

    // Other badge sizes use palette-specific encoding
    const palette = state.palette;
    if (palette === 'bwyr') {
      return convertBWYR(data, width, height);
    } else if (palette === 'bwr') {
      return convertBWR(data, width, height);
    } else {
      return convertBW(data, width, height);
    }
  }

  function convertBWYR(data, width, height) {
    const totalPixels = width * height;
    const outputSize = Math.ceil(totalPixels / 4);
    const output = new Uint8Array(outputSize);

    // BWYR palette for closest-color matching (handles non-dithered pixels too)
    const bwyrPalette = PALETTES.bwyr;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];

        const closest = findClosestColor(r, g, b, bwyrPalette);
        // Map palette entry to 2-bit value: Black=0, White=1, Yellow=2, Red=3
        let colorValue;
        if (closest[0] === 0) colorValue = 0;           // Black
        else if (closest[1] === 255 && closest[2] === 255) colorValue = 1; // White
        else if (closest[1] === 255) colorValue = 2;     // Yellow
        else colorValue = 3;                              // Red

        // Column-major: 4 horizontal pixels per byte, 416 bytes per column-group
        const outIdx = (x >> 2) * height + y;
        output[outIdx] = (output[outIdx] << 2) | colorValue;
      }
    }
    return [output];
  }

  function convertBWR(data, width, height) {
    const totalPixels = width * height;
    const outputSize = Math.ceil(totalPixels / 8);
    const bw = new Uint8Array(outputSize);
    const red = new Uint8Array(outputSize);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];

        const luminance = r * 0.3 + g * 0.59 + b * 0.11;
        const v1 = luminance <= 95 ? 1 : 0;
        const isRed = r > 95 && g < 95 && b < 95;
        const v2 = isRed ? 1 : 0;

        // Column-major, Y-flipped: 8 horizontal pixels per byte
        const outIdx = (x >> 3) * height + (height - 1 - y);
        bw[outIdx] = (bw[outIdx] << 1) | v1;
        red[outIdx] = (red[outIdx] << 1) | v2;
      }
    }
    return [bw, red];
  }

  function convertBW(data, width, height) {
    const totalPixels = width * height;
    const outputSize = Math.ceil(totalPixels / 8);
    const bw = new Uint8Array(outputSize);
    const layer2 = new Uint8Array(outputSize);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];

        const luminance = r * 0.3 + g * 0.59 + b * 0.11;
        const v1 = luminance <= 95 ? 1 : 0;

        // Column-major, Y-flipped: 8 horizontal pixels per byte
        const outIdx = (x >> 3) * height + (height - 1 - y);
        bw[outIdx] = (bw[outIdx] << 1) | v1;
      }
    }
    return [bw, layer2];
  }

  function setStatus(text, connected, error) {
    document.getElementById('statusText').textContent = text;
    const dot = document.getElementById('statusDot');
    dot.className = 'status-dot';
    if (connected) dot.classList.add('connected');
    if (error) dot.classList.add('error');
  }

  // ─── Event Handlers ───
  function initEventHandlers() {
    const syncQrFieldVisibility = () => {
      document.getElementById('qrContentGroup').style.display =
        state.template === 'qrcode' || state.template === 'mix' ? 'block' : 'none';
    };
    const qrSizeInput = document.getElementById('qrSize');
    const qrSizeValue = document.getElementById('qrSizeValue');
    const syncQrSizeLabel = () => {
      qrSizeInput.value = String(state.qrScalePercent);
      qrSizeValue.textContent = `${state.qrScalePercent}%`;
    };

    // Tabs
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.getElementById('tab-' + target).classList.add('active');
        if (target === 'image' && state.uploadedImage) {
          state.mode = 'image';
        } else {
          state.mode = 'template';
        }
        render();
      });
    });

    // Template selection
    document.querySelectorAll('.template-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.template-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.template = btn.dataset.template;
        state.mode = 'template';
        syncQrFieldVisibility();
        render();
      });
    });

    // Text inputs
    ['badgeName', 'badgeTitle', 'badgeCompany', 'badgeExtra'].forEach((id) => {
      const el = document.getElementById(id);
      const key = id.replace('badge', '').toLowerCase();
      el.addEventListener('input', () => {
        state[key] = el.value;
        if (state.mode === 'template') render();
      });
    });

    // QR content input
    document.getElementById('qrContent').addEventListener('input', (e) => {
      state.qrContent = e.target.value;
      if (state.mode === 'template' && (state.template === 'qrcode' || state.template === 'mix')) render();
    });
    qrSizeInput.addEventListener('input', (e) => {
      state.qrScalePercent = Number(e.target.value);
      syncQrSizeLabel();
      if (state.mode === 'template' && (state.template === 'qrcode' || state.template === 'mix')) render();
    });

    // Accent color
    document.querySelectorAll('.color-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.accentColor = btn.dataset.color;
        // Sync accent-linked item color swatches
        const accentColor = snapToNearestPaletteColor(btn.dataset.color);
        const accentItems = ['company', 'extra'];
        accentItems.forEach((key) => {
          state.itemColors[key].text = accentColor;
          const swatch = document.getElementById(key + 'TextColor');
          if (swatch) swatch.style.background = accentColor;
        });
        render();
      });
    });

    // Per-item palette color swatches (text & background)
    document.querySelectorAll('.item-color-swatch').forEach((swatch) => {
      buildPalettePopup(swatch);
      swatch.addEventListener('click', (e) => {
        // Close any other open popups
        document.querySelectorAll('.palette-popup.open').forEach(p => {
          if (p.parentElement !== swatch) {
            p.classList.remove('open');
            p.parentElement.classList.remove('active-pick');
          }
        });
        const popup = swatch.querySelector('.palette-popup');
        buildPalettePopup(swatch);
        popup.classList.toggle('open');
        swatch.classList.toggle('active-pick');
      });
    });

    // Close palette popups on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.item-color-swatch')) {
        document.querySelectorAll('.palette-popup.open').forEach(p => {
          p.classList.remove('open');
          p.parentElement.classList.remove('active-pick');
        });
      }
    });

    // Image upload
    const uploadZone = document.getElementById('uploadZone');
    const imageInput = document.getElementById('imageFileInput');
    const templateBgUploadZone = document.getElementById('templateBgUploadZone');
    const templateBgFileInput = document.getElementById('templateBgFileInput');
    const clearTemplateBgBtn = document.getElementById('clearTemplateBgBtn');

    function bindImageUpload(zone, input, onFile) {
      zone.addEventListener('click', () => input.click());
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        if (e.dataTransfer.files.length) onFile(e.dataTransfer.files[0]);
      });
      input.addEventListener('change', () => {
        if (input.files.length) onFile(input.files[0]);
      });
    }

    bindImageUpload(uploadZone, imageInput, (file) => handleImageFile(file, 'uploaded'));
    bindImageUpload(templateBgUploadZone, templateBgFileInput, (file) => handleImageFile(file, 'templateBackground'));

    clearTemplateBgBtn.addEventListener('click', () => {
      state.templateBackgroundImage = null;
      templateBgFileInput.value = '';
      document.getElementById('templateBgPreview').innerHTML = '';
      clearTemplateBgBtn.style.display = 'none';
      if (state.mode === 'template') render();
    });

    // Dither buttons
    document.querySelectorAll('.dither-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.dither-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.dither = btn.dataset.dither;
        render();
      });
    });

    // Palette buttons
    document.querySelectorAll('.palette-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.palette-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.palette = btn.dataset.palette;
        // Snap all item colors to the new palette and rebuild popups
        refreshAllSwatches();
        render();
      });
    });

    // Badge size
    document.getElementById('badgeSize').addEventListener('change', (e) => {
      state.sizeKey = e.target.value;
      const spec = getSpec();
      document.querySelector('.preview-info').innerHTML =
        `${spec.width} &times; ${spec.height} px &mdash; ${BADGE_SPECS[state.sizeKey].label} e-paper`;
      render();
    });

    // Orientation
    document.getElementById('badgeOrientation').addEventListener('change', (e) => {
      state.orientation = e.target.value;
      const spec = getSpec();
      document.querySelector('.preview-info').innerHTML =
        `${spec.width} &times; ${spec.height} px &mdash; ${BADGE_SPECS[state.sizeKey].label} e-paper`;
      render();
    });

    // Download
    document.getElementById('downloadBtn').addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = 'badge.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });

    // BLE
    if ('bluetooth' in navigator) {
      document.getElementById('bleConnectBtn').addEventListener('click', bleConnect);
      document.getElementById('bleSendBtn').addEventListener('click', bleSendImage);
    } else {
      document.getElementById('bleSupported').style.display = 'none';
      document.getElementById('bleNotSupported').style.display = 'block';
    }

    syncQrFieldVisibility();
    syncQrSizeLabel();
  }

  function handleImageFile(file, target = 'uploaded') {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        if (target === 'templateBackground') {
          state.templateBackgroundImage = img;
          const preview = document.getElementById('templateBgPreview');
          preview.innerHTML = `<img src="${e.target.result}" alt="Template background">
            <p style="font-size:0.75rem; color:var(--text-dim); margin-top:4px;">
              ${img.width} &times; ${img.height} px
            </p>`;
          document.getElementById('clearTemplateBgBtn').style.display = 'block';
          if (state.mode === 'template') render();
          return;
        }

        state.uploadedImage = img;
        state.mode = 'image';

        // Show preview
        const preview = document.getElementById('uploadedPreview');
        preview.innerHTML = `<img src="${e.target.result}" alt="Uploaded">
          <p style="font-size:0.75rem; color:var(--text-dim); margin-top:4px;">
            ${img.width} &times; ${img.height} px
          </p>`;

        render();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ─── Init ───
  initEventHandlers();
  render();
})();

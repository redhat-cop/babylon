#!/usr/bin/env python3
"""
Generate a static mockup PNG for the Ops Workshop Control → Showrooms panel UI.

Requires: pip install pillow

Usage (from catalog/ui):
  python3 scripts/generate_ops_showroom_mockup.py
  # writes docs/images/ops-showroom-panel-mockup.png
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# PatternFly-ish palette (light theme)
BG_PAGE = (245, 245, 245)
BG_PANEL = (255, 255, 255)
BG_HEADER = (240, 240, 240)
BORDER = (210, 210, 210)
TEXT = (21, 21, 21)
TEXT_MUTED = (96, 96, 96)
BTN_SECONDARY = (240, 240, 240)
BTN_BORDER = (180, 180, 180)
LINK = (0, 102, 204)
DOT_OK = (62, 134, 53)
DOT_FAIL = (201, 25, 11)
DOT_UNKNOWN = (106, 110, 115)
TITLE_BAR = (21, 21, 21)


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in candidates:
        if os.path.isfile(p):
            try:
                if p.endswith(".ttc"):
                    return ImageFont.truetype(p, size, index=0)
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def draw_round_rect(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    fill: tuple[int, int, int],
    outline: tuple[int, int, int] | None = None,
    radius: int = 4,
) -> None:
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill, outline=outline)


def draw_dot(
    draw: ImageDraw.ImageDraw,
    cx: int,
    cy: int,
    color: tuple[int, int, int],
    r: int = 6,
) -> None:
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    out_dir = root / "docs" / "images"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "ops-showroom-panel-mockup.png"

    w, h = 1280, 720
    im = Image.new("RGB", (w, h), BG_PAGE)
    draw = ImageDraw.Draw(im)

    font_title = _load_font(22)
    font_sub = _load_font(14)
    font_body = _load_font(13)
    font_small = _load_font(11)

    # Masthead strip
    draw.rectangle([0, 0, w, 52], fill=TITLE_BAR)
    draw.text((24, 14), "Babylon · Operations Workshop Control (mock)", fill=(255, 255, 255), font=font_title)

    # Workshop row hint
    y = 68
    draw.text((24, y), "Workshop row:  My Demo Lab", fill=TEXT, font=font_sub)
    draw.text((280, y), "Showrooms", fill=LINK, font=font_sub)

    # Panel card
    pad = 24
    px0, py0 = pad, 110
    px1, py1 = w - pad, h - pad
    draw_round_rect(draw, (px0, py0, px1, py1), BG_PANEL, BORDER, 6)

    # Inner title
    iy = py0 + 16
    draw.text((px0 + 16, iy), "Showrooms — per-user URLs & probes", fill=TEXT, font=font_sub)
    iy += 36

    # Batch row
    draw.text((px0 + 16, iy), "Batch checks", fill=TEXT_MUTED, font=font_small)
    bx = px0 + 120
    for label, dx in [("Check healthz", 0), ("Check readyz", 140)]:
        x0, y0 = bx + dx, iy - 4
        x1, y1 = x0 + 130, y0 + 28
        draw_round_rect(draw, (x0, y0, x1, y1), BTN_SECONDARY, BTN_BORDER, 4)
        draw.text((x0 + 10, y0 + 6), label, fill=TEXT, font=font_small)

    iy += 44
    # Table header
    row_h = 36
    hx0 = px0 + 12
    hx1 = px1 - 12
    draw.rectangle([hx0, iy, hx1, iy + row_h], fill=BG_HEADER, outline=BORDER)
    cols = [
        (hx0 + 8, "User", 140),
        (hx0 + 160, "Showroom", 220),
        (hx0 + 400, "/healthz", 100),
        (hx0 + 520, "/readyz", 100),
        (hx0 + 660, "Recheck", 200),
    ]
    for cx, label, _ in cols:
        draw.text((cx, iy + 9), label, fill=TEXT, font=font_small)
    iy += row_h

    # Rows
    rows_data = [
        ("user1", "OK", "OK"),
        ("user2", "OK", "unknown"),
    ]
    for uname, hz, rz in rows_data:
        draw.rectangle([hx0, iy, hx1, iy + row_h], outline=BORDER)
        draw.text((hx0 + 8, iy + 9), uname, fill=TEXT, font=font_body)
        draw.text((hx0 + 160, iy + 9), "Showroom ↗", fill=LINK, font=font_body)
        # dots under /healthz /readyz columns (centered in column)
        cx_hz = hx0 + 400 + 40
        cx_rz = hx0 + 520 + 40
        cy = iy + row_h // 2
        hz_color = DOT_OK if hz == "OK" else DOT_FAIL if hz == "fail" else DOT_UNKNOWN
        rz_color = DOT_OK if rz == "OK" else DOT_FAIL if rz == "fail" else DOT_UNKNOWN
        draw_dot(draw, cx_hz, cy, hz_color)
        draw_dot(draw, cx_rz, cy, rz_color)
        # Recheck links
        draw.text((hx0 + 660, iy + 4), "healthz ↻", fill=LINK, font=font_small)
        draw.text((hx0 + 660, iy + 18), "readyz ↻", fill=LINK, font=font_small)
        iy += row_h

    # Legend
    iy += 16
    legend_y = iy
    draw.text((hx0 + 8, legend_y), "Legend:", fill=TEXT_MUTED, font=font_small)
    lx = hx0 + 70
    for label, col in [
        ("OK", DOT_OK),
        ("HTTP error", DOT_FAIL),
        ("Unknown (e.g. CORS)", DOT_UNKNOWN),
    ]:
        draw_dot(draw, lx + 6, legend_y + 8, col)
        draw.text((lx + 18, legend_y), label, fill=TEXT_MUTED, font=font_small)
        lx += 160

    # Footer note
    draw.text(
        (px0 + 16, py1 - 36),
        "Proposed UI — not from a live cluster. Green/red/gray dots = probe result.",
        fill=TEXT_MUTED,
        font=font_small,
    )

    im.save(out_path, "PNG", optimize=True)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()

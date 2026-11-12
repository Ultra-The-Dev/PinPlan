"""Turn a flat plan scan into a realistic phone photo of the paper: tilted on a table, soft uneven light,
a shadow under the sheet, slight blur and sensor noise. CI uses it to test the app's page detection,
straightening and cleanup on a real drawing.  Usage: python3 make_plan_photo.py scan.tif out.jpg"""
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None


def coeffs(src, dst):
    """Perspective coefficients mapping output points (dst) back to input points (src)."""
    a, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        a += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
        b += [u, v]
    return np.linalg.solve(np.array(a, float), np.array(b, float)).tolist()


scan = Image.open(sys.argv[1]).convert("L")
scan.thumbnail((3600, 3600))
sw, sh = scan.size
s = np.asarray(scan, np.float32)
paper = np.stack([s * 0.97 + 4, s * 0.95 + 5, s * 0.90 + 8], -1).clip(0, 255).astype(np.uint8)
paper = Image.fromarray(paper)

W, H = 4032, 3024  # 12 MP phone photo
dst = [(430, 360), (3560, 250), (3790, 2780), (240, 2690)]  # tilted, closer at the bottom
src = [(0, 0), (sw, 0), (sw, sh), (0, sh)]
warped = paper.transform((W, H), Image.PERSPECTIVE, coeffs(src, dst), Image.BICUBIC)
mask = Image.new("L", (sw, sh), 255).transform((W, H), Image.PERSPECTIVE, coeffs(src, dst), Image.BICUBIC)

photo = Image.new("RGB", (W, H), (96, 80, 66))  # wooden table
shadow = Image.new("L", (W, H), 0)
ImageDraw.Draw(shadow).polygon([(x + 30, y + 35) for x, y in dst], fill=150)
photo.paste((42, 34, 28), mask=shadow.filter(ImageFilter.GaussianBlur(45)))
photo.paste(warped, mask=mask)

# Soft light falloff: brighter top-right, ~45 % darker toward the bottom-left corner.
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
t = ((W - xx) / W * 0.6 + yy / H * 0.4)
light = 1.0 - 0.45 * t ** 1.6
img = np.asarray(photo, np.float32) * light[..., None]
img += np.random.default_rng(7).normal(0, 4.0, img.shape)  # sensor noise
photo = Image.fromarray(img.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))
photo.save(sys.argv[2], quality=88)
print("wrote", sys.argv[2], photo.size)

#!/usr/bin/env python3
"""Screenshot sanity check (LESSONS: never ship a blank image).
Prints size + pixel stddev + unique-color count; flags likely-blank shots."""
import sys
from PIL import Image
import statistics

for p in sys.argv[1:]:
    im = Image.open(p).convert("L")
    px = list(im.getdata())
    sd = statistics.pstdev(px)
    uniq = len(set(px))
    verdict = "OK" if sd > 8 and uniq > 24 else "SUSPECT-BLANK"
    print(f"{p}: {im.size[0]}x{im.size[1]} stddev={sd:.1f} unique_grays={uniq} -> {verdict}")

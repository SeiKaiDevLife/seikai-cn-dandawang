import re

path = "M187.12,148.86a35.3,35.3,0,0,1-16.87-21.14,44,44,0,0,0-84.5,0A35.25,35.25,0,0,1,69,148.82,40,40,0,0,0,88,224a39.48,39.48,0,0,0,15.52-3.13,64.09,64.09,0,0,1,48.87,0,40,40,0,0,0,34.73-72Z"
import xml.etree.ElementTree as ET
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path id="p" d="{path}"/></svg>'
with open("test2.svg", "w") as f: f.write(svg)

# Since I don't have svgpathtools installed, I will manually approximate:
# X min is near 69. X max is near 187.12 + 34.73 = 221.85 (Wait, 69 to ~187 is width ~118. Let's see the center X).
# Phosphor icons are centered at X=128. Since it is horizontally symmetric, X bounds are likely 128 +/- W/2.
# Y min is around 127.72 (148.86 - 21.14). Y max is 224. Height is approx 96.
print("Done")

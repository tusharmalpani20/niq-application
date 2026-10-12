const hexColor = /^#[0-9a-f]{6}$/i;

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Find a readable shade of the organisation color on every report surface. */
export function accessibleBrandInk(hex: string, surfaces: readonly string[] = ["#ffffff"]): string {
  const brand = hexColor.test(hex) ? hex : "#3bb9bd";
  const backgrounds = surfaces.length && surfaces.every(surface => hexColor.test(surface)) ? surfaces : ["#ffffff"];
  const channels = [1, 3, 5].map(offset => parseInt(brand.slice(offset, offset + 2), 16));
  const tinted = backgrounds.map(background => `#${[1, 3, 5].map((offset, index) => Math.round(parseInt(background.slice(offset, offset + 2), 16) * 0.9 + channels[index]! * 0.1).toString(16).padStart(2, "0")).join("")}`);
  for (let percent = 100; percent >= 0; percent--) {
    const candidate = `#${channels.map(channel => Math.floor(channel * percent / 100).toString(16).padStart(2, "0")).join("")}`;
    if ([...backgrounds, ...tinted].every(background => contrastRatio(candidate, background) >= 4.5)) return candidate;
  }
  return "#000000";
}

const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
export function colourContrastRatio(first: string, second: string): number {
  if (!isHex(first) || !isHex(second)) return 0;
  const a = luminance(first); const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/** Selects the black or white foreground with the higher WCAG contrast ratio. */
export function contrastingForeground(hex: string): "#000000" | "#ffffff" {
  if (!isHex(hex)) return "#ffffff";
  return colourContrastRatio(hex, "#000000") >= colourContrastRatio(hex, "#ffffff") ? "#000000" : "#ffffff";
}
/** Keep the brand hue while finding readable text on the light client surfaces. Does not alter button fills. */
export function accessibleBrandInk(hex: string, surfaces: readonly string[] = ["#f6f8fb", "#eef2f6", "#ffffff"]): string {
  const brand = isHex(hex) ? hex : "#0e9384";
  const backgrounds = surfaces.length && surfaces.every(isHex) ? surfaces : ["#f6f8fb", "#eef2f6", "#ffffff"];
  const channels = [1, 3, 5].map(offset => parseInt(brand.slice(offset, offset + 2), 16));
  for (let percent = 100; percent >= 0; percent--) {
    const candidate = `#${channels.map(channel => Math.floor(channel * percent / 100).toString(16).padStart(2, "0")).join("")}`;
    if (backgrounds.every(background => colourContrastRatio(candidate, background) >= 4.5)) return candidate;
  }
  return "#000000";
}

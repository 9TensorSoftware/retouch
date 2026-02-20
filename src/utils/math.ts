export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function constrainToAspectRatio(
  width: number,
  height: number,
  ratio: number,
  anchor: "width" | "height" = "width",
): { width: number; height: number } {
  if (anchor === "width") {
    return { width, height: width / ratio };
  }
  return { width: height * ratio, height };
}

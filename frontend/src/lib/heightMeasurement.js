export function getMeasurementHeight({ linePixelHeight, imageHeight, heightImage, heightOffset = 103 }) {
  const line = Number(linePixelHeight);
  const img = Number(imageHeight);
  const base = Number(heightImage);
  const offset = Number(heightOffset);
  if (!line || !img || !base || !offset || line <= 0 || img <= 0 || base <= 0 || offset <= 0) return null;
  return Math.round((line / img) * base) + offset;
}

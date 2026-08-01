export function getMeasurementHeight({ linePixelHeight, imageHeight, heightImage }) {
  const line = Number(linePixelHeight);
  const img = Number(imageHeight);
  const base = Number(heightImage);
  if (!line || !img || !base || line <= 0 || img <= 0 || base <= 0) return null;
  return Math.round((line / img) * base);
}

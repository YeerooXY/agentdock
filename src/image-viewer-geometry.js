export function imageGeometry(width, height, stageWidth, stageHeight, zoom, x = 0, y = 0) {
  const scale = zoom === 'actual' ? 1 : Math.min(2, stageWidth / width, stageHeight / height);
  const imageWidth = width * scale, imageHeight = height * scale;
  const limitX = Math.max(0, (imageWidth - stageWidth) / 2);
  const limitY = Math.max(0, (imageHeight - stageHeight) / 2);
  return { width: imageWidth, height: imageHeight,
    x: Math.max(-limitX, Math.min(limitX, x)), y: Math.max(-limitY, Math.min(limitY, y)) };
}

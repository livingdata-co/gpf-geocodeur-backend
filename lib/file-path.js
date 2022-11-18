export function getFilePath(fileId, type) {
  const date = new Date().toISOString().slice(0, 10)

  return `${type}-${date}/${fileId}`
}

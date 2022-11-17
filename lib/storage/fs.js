import process from 'node:process'
import path from 'node:path'
import fs from 'fs-extra'
import {nanoid} from 'nanoid'

const {STORAGE_FS_DIR} = process.env

function getFilePath(fileId, type) {
  const date = new Date().toISOString().slice(0, 10)

  return `${type}-${date}/${fileId}`
}

function createStorage(options) {
  const {uploadPath} = options

  return {
    async getFileInfos(filePath) {
      try {
        const stats = await fs.stat(path.join(uploadPath, filePath))
        return stats
      } catch (error) {
        throw new Error(`An error has occurred: ${error}`)
      }
    },

    async createDownloadStream(filePath) {
      try {
        await fs.access(path.join(uploadPath, filePath))
        const downloadStream = await fs.createReadStream(path.join(uploadPath, filePath))
        return downloadStream
      } catch (error) {
        throw new Error(`An error has occurred: ${error}`)
      }
    },

    async uploadStream(inputStream, type) {
      try {
        const id = nanoid()
        const filePath = getFilePath(id, type)

        await fs.ensureFile(path.join(uploadPath, filePath))
        const outputStream = await fs.createWriteStream(path.join(uploadPath, filePath))
        await inputStream.pipe(outputStream)

        return {
          id,
          filePath
        }
      } catch (error) {
        throw new Error(`An error has occurred: ${error}`)
      }
    }
  }
}

const storage = createStorage({
  uploadPath: STORAGE_FS_DIR
})

export default storage

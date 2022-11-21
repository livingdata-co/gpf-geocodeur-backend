import {pipeline} from 'node:stream/promises'
import {constants, access, mkdir, rm} from 'node:fs/promises'
import {createReadStream, createWriteStream} from 'node:fs'
import {nanoid} from 'nanoid'

export function generateObjectKey(type) {
  const date = new Date().toISOString().slice(0, 10)

  return `${type}-${date}/${nanoid()}`
}

export function createStorage(options = {}) {
  const storageDir = options.storageDir || new URL('../../data/', import.meta.url)

  return {
    async createDownloadStream(objectKey) {
      const filePath = new URL(objectKey, storageDir)
      await access(filePath, constants.R_OK)
      return createReadStream(filePath)
    },

    async uploadFile(inputStream, objectType) {
      await mkdir(storageDir, {recursive: true})
      await access(storageDir, constants.W_OK)

      const objectKey = generateObjectKey(objectType)

      const filePath = new URL(objectKey, storageDir)

      const parentDirPath = new URL('.', filePath)
      await mkdir(parentDirPath, {recursive: true})

      const fileWriteStream = createWriteStream(filePath)
      await pipeline(inputStream, fileWriteStream)

      return objectKey
    },

    async deleteFile(objectKey) {
      const filePath = new URL(objectKey, storageDir)
      await rm(filePath)
    }
  }
}

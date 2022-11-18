import process from 'node:process'

import {createStorage as s3} from './s3.js'
import {createStorage as fs} from './fs.js'

const {
  STORAGE_FS_DIR,
  STORAGE_S3_REGION,
  STORAGE_S3_ENDPOINT,
  STORAGE_S3_ACCESS_KEY,
  STORAGE_S3_SECRET_KEY,
  STORAGE_S3_BUCKET_NAME
} = process.env

function selectStorage(options) { // If 'STORAGE_FS_DIR' exists we use 'fs', otherwise we use 's3'.
  const {
    uploadPath,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket
  } = options

  if (!uploadPath && (!region || !endpoint || !accessKeyId || !secretAccessKey || !bucket)) {
    throw new Error('For FS storage: uploadPath is required. For S3 storage: region, endpoint, accessKeyId, secretAccessKey and bucket are required.')
  }

  if (uploadPath) {
    return fs({uploadPath})
  }

  if (!uploadPath) {
    if (!region || !endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error('S3 storage needs: region, endpoint, accessKeyId, secretAccessKey and bucket')
    }

    return s3({
      region,
      endpoint,
      accessKeyId,
      secretAccessKey,
      bucket
    })
  }
}

function storage(options) {
  const isFsStorage = Boolean(options.uploadPath)
  const selectedStorage = selectStorage(options)

  return {
    async getInfos(element) { // Expects an object name for S3 storage, or a file path for FS storage
      try {
        const infos = await (
          isFsStorage
            ? selectedStorage.getFileInfos(element)
            : selectedStorage.getObjectInfo(element)
        )

        return infos
      } catch (error) {
        throw new Error(`An error has occurred: ${error}`)
      }
    },

    async createDownloadStream(element) { // Expects an object name for S3 storage, or a file path for FS storage
      try {
        const downloadStream = await selectedStorage.createDownloadStream(element)
        return downloadStream
      } catch (error) {
        throw new Error(`An error has occurred: ${error}`)
      }
    },

    async upload(inputStream, type, options) {
      try {
        const metadata = await (isFsStorage ? selectedStorage.uploadStream(inputStream, type) : selectedStorage.uploadObject(inputStream, type, options))

        return metadata
      } catch (error) {
        throw new Error(`An error has occurred: ${error}`)
      }
    }
  }
}

export default storage({
  uploadPath: STORAGE_FS_DIR,
  region: STORAGE_S3_REGION,
  endpoint: STORAGE_S3_ENDPOINT,
  accessKeyId: STORAGE_S3_ACCESS_KEY,
  secretAccessKey: STORAGE_S3_SECRET_KEY,
  bucket: STORAGE_S3_BUCKET_NAME
})

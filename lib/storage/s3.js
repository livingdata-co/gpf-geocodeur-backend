import {Upload} from '@aws-sdk/lib-storage'
import {nanoid} from 'nanoid'

import {S3, GetObjectCommand, HeadObjectCommand} from '@aws-sdk/client-s3'

export function getFilePath(fileId, type) {
  const date = new Date().toISOString().slice(0, 10)

  return `${type}-${date}/${fileId}`
}

export function createStorage(options) {
  const {region, endpoint, accessKeyId, secretAccessKey, bucket} = options

  const client = new S3({
    region,
    endpoint,
    s3BucketEndpoint: true,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  })

  return {
    async getObjectInfo(objectName) {
      try {
        const input = new HeadObjectCommand({Bucket: bucket, Key: objectName})
        const objectInfo = await client.send(input)
        return objectInfo
      } catch (error) {
        if (error.$metadata.httpStatusCode === 404) {
          throw new Error(`Object ${objectName} not found`)
        }

        throw new Error(`An error has occurred: ${error}`)
      }
    },

    async createDownloadStream(objectName) {
      try {
        const input = new GetObjectCommand({Bucket: bucket, Key: objectName})
        const downloadStream = await client.send(input)
        return downloadStream.Body
      } catch (error) {
        throw new Error(`An error has occurred: ${error}`)
      }
    },

    async uploadObject(inputStream, objectType, options) {
      try {
        const id = nanoid()
        const filePath = getFilePath(id, objectType)

        const upload = new Upload({
          client,
          params: {
            Bucket: bucket,
            Key: filePath,
            Body: inputStream,
            Metadata: {
              filename: options?.fileName || objectType,
              size: options?.size?.toString()
            }
          }
        })

        upload.on('httpUploadProgress', progress => {
          console.log(progress)
        })

        const uploadMetadata = await upload.done()
        return uploadMetadata
      } catch (error) {
        throw new Error(`An error has occurred: ${error}`)
      }
    }
  }
}

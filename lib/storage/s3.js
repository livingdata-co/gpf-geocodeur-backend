import {Readable} from 'node:stream'
import {S3, GetObjectCommand, DeleteObjectCommand} from '@aws-sdk/client-s3'
import {Upload} from '@aws-sdk/lib-storage'
import {nanoid} from 'nanoid'

export function generateObjectKey(type) {
  const date = new Date().toISOString().slice(0, 10)

  return `${type}-${date}/${nanoid()}`
}

export function createStorage(options = {}) {
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
    async createDownloadStream(objectKey) {
      const command = new GetObjectCommand({Bucket: bucket, Key: objectKey})
      const downloadStream = await client.send(command)
      return downloadStream.Body
    },

    async uploadFile(inputStream, objectType) {
      const objectKey = generateObjectKey(objectType)

      const upload = new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: objectKey,
          Body: inputStream instanceof Readable ? inputStream : Readable.toWeb(inputStream)
        }
      })

      await upload.done()
      return objectKey
    },

    async deleteFile(objectKey) {
      const command = new DeleteObjectCommand({Bucket: bucket, Key: objectKey})
      await client.send(command)
    }
  }
}

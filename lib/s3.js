import {Upload} from '@aws-sdk/lib-storage'
import {nanoid} from 'nanoid'

import {S3, GetObjectCommand, HeadObjectCommand} from '@aws-sdk/client-s3'

const {
  STORAGE_S3_REGION,
  STORAGE_S3_ENDPOINT,
  STORAGE_S3_ACCESS_KEY,
  STORAGE_S3_SECRET_KEY
} = process.env /* eslint n/prefer-global/process: off */

const client = new S3({
  region: STORAGE_S3_REGION,
  endpoint: STORAGE_S3_ENDPOINT,
  s3BucketEndpoint: true,
  credentials: {
    accessKeyId: STORAGE_S3_ACCESS_KEY,
    secretAccessKey: STORAGE_S3_SECRET_KEY
  }
})

function getFilePath(fileId, type) {
  const date = new Date().toLocaleString('fr-FR')
    .split(' ')[0]
    .replaceAll('/', '-')

  return `${type}-${date}/${fileId}`
}

export async function getObjectInfo(bucket, objectName) {
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
}

export async function createUploadStream(inputStream, bucket, objectType, fileName) {
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
          filename: fileName || objectType,
          length: inputStream.readableLength.toString()
        }
      }
    })

    upload.on('httpUploadProgress', progress => {
      console.log(progress)
    })

    await upload.done()
    return inputStream
  } catch (error) {
    throw new Error(`An error has occurred: ${error}`)
  }
}

export async function createDownloadStream(bucket, objectName) {
  try {
    const input = new GetObjectCommand({Bucket: bucket, Key: objectName})
    const downloadStream = await client.send(input)
    return downloadStream.Body
  } catch (error) {
    throw new Error(`An error has occurred: ${error}`)
  }
}

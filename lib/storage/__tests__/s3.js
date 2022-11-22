import {createReadStream} from 'node:fs'
import {rm, mkdir} from 'node:fs/promises'
import {S3Client, GetObjectCommand} from '@aws-sdk/client-s3'
import S3rver from 's3rver'
import hasha from 'hasha'
import test from 'ava'

import {createStorage} from '../s3.js'

const sampleFile = new URL('fixtures/sample.csv', import.meta.url)
const sampleStream = createReadStream(sampleFile)

const s3rverTestDirectory = './dist'

const storageConfig = {
  region: 'fr-par',
  bucket: 'test_bucket',
  endpoint: 'http://localhost:4569',
  accessKeyId: 'S3RVER',
  secretAccessKey: 'S3RVER'
}

const s3ClientConfig = {
  ...storageConfig,
  forcePathStyle: true,
  credentials: {
    accessKeyId: storageConfig.accessKeyId,
    secretAccessKey: storageConfig.secretAccessKey
  }
}

const client = new S3Client(s3ClientConfig)

test.before('create S3 test directory', () => {
  mkdir(s3rverTestDirectory)
})

test.before('create S3 server', () => {
  new S3rver({
    port: 4569,
    accessKeyId: 'S3RVER',
    secretAccessKey: 'S3RVER',
    address: 'localhost',
    configureBuckets: [
      {name: 'test_bucket'}
    ],
    silent: false,
    directory: s3rverTestDirectory
  }).run()
})

test.after.always('remove S3 test directory', async () => {
  await rm(s3rverTestDirectory, {recursive: true})
})

test('create download stream', async t => {
  const uploadedObjectKey = await createStorage(storageConfig).uploadFile(sampleStream, 'test')

  const downloadStream = await createStorage(storageConfig).createDownloadStream(uploadedObjectKey)

  const command = new GetObjectCommand({Bucket: 'test_bucket', Key: uploadedObjectKey})
  const objectFromS3 = await client.send(command)

  const downloadStreamHash = await hasha.fromStream(downloadStream, {algorithm: 'md5'})
  const uploadedStreamHash = await hasha.fromStream(objectFromS3.Body, {algorithm: 'md5'})

  t.is(downloadStreamHash, uploadedStreamHash)
})

test('upload file', async t => {
  const uploadedObjectKey = await createStorage(storageConfig).uploadFile(sampleStream, 'test')

  const command = new GetObjectCommand({Bucket: 'test_bucket', Key: uploadedObjectKey})
  const objectFromS3 = await client.send(command)

  const sampleStreamHash = await hasha.fromStream(sampleStream, {algorithm: 'md5'})
  const objectFromS3StreamHash = await hasha.fromStream(objectFromS3.Body, {algorithm: 'md5'})

  t.is(sampleStreamHash, objectFromS3StreamHash)
})

test('delete file', async t => {
  const uploadedObjectKey = await createStorage(storageConfig).uploadFile(sampleStream, 'test')

  await createStorage(storageConfig).deleteFile(uploadedObjectKey)

  const command = new GetObjectCommand({Bucket: 'test_bucket', Key: uploadedObjectKey})
  const error = await t.throwsAsync(() => client.send(command))

  t.is(error.Code, 'NoSuchKey')
  t.is(error.Key, uploadedObjectKey)
  t.is(error.message, 'The specified key does not exist.')
})

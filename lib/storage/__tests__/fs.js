import process from 'node:process'
import {createReadStream} from 'node:fs'
import {access, rm} from 'node:fs/promises'

import test from 'ava'
import hasha from 'hasha'

import {createStorage} from '../fs.js'

const sampleFile = new URL('./fixtures/sample.csv', import.meta.url)
const testStorageDir = new URL('./dist/', 'file://' + process.cwd() + '/')

test.after.always('remove test directory', async () => {
  await rm(testStorageDir, {recursive: true})
})

const uploadSampleFile = async () => {
  const sampleStream = createReadStream(sampleFile)
  const filePath = await createStorage({storageDir: testStorageDir}).uploadFile(sampleStream, 'test')
  const uploadedFileUrl = new URL(filePath, testStorageDir)

  return {
    filePath,
    uploadedFileUrl
  }
}

test('create download stream', async t => {
  const {filePath, uploadedFileUrl} = await uploadSampleFile()

  const downloadStream = await createStorage({storageDir: testStorageDir}).createDownloadStream(filePath)

  const uploadedFileHash = await hasha.fromFile(uploadedFileUrl.pathname)
  const downloadedFileHash = await hasha.fromStream(downloadStream)

  t.is(uploadedFileHash, downloadedFileHash)
})

test('upload file', async t => {
  const sampleStream = createReadStream(sampleFile)
  const filePath = await createStorage({storageDir: testStorageDir}).uploadFile(sampleStream, 'test')
  const uploadedFileUrl = new URL(filePath, testStorageDir)

  await t.notThrowsAsync(() => access(uploadedFileUrl))
})

test('delete file', async t => {
  const {filePath, uploadedFileUrl} = await uploadSampleFile()
  await createStorage({storageDir: testStorageDir}).deleteFile(filePath)

  await t.throwsAsync(() => access(uploadedFileUrl))
})

test('create download stream / no such file', async t => {
  const wrongPath = 'test/12345'
  const error = await t.throwsAsync(() => createStorage({storageDir: testStorageDir}).createDownloadStream(wrongPath))

  t.is(error.message, `ENOENT: no such file or directory, access '${testStorageDir.pathname}${wrongPath}'`)
})

test('delete file / no such file', async t => {
  const wrongPath = 'test/12345'
  const error = await t.throwsAsync(() => createStorage({storageDir: testStorageDir}).deleteFile(wrongPath))

  t.is(error.message, `ENOENT: no such file or directory, stat '${testStorageDir.pathname}${wrongPath}'`)
})

import process from 'node:process'
import path from 'node:path'
import stream from 'node:stream'
import test from 'ava'
import fs from 'fs-extra'

import storage from '../fs.js'

const uploadPathTest = path.join(process.cwd(), 'test', 'dist')
const fixturesPath = path.join('..', '..', 'lib', 'storage', 'test', 'fixtures', 'sample.csv')

test.after.always('remove dist directory', () => {
  fs.removeSync(uploadPathTest)
})

test('Get file Info', async t => {
  const stats = await storage.getFileInfos(fixturesPath)
  t.is(stats.size, 793)
})

test('Get file Info / file not found', async t => {
  const error = await t.throwsAsync(() => storage.getFileInfos('sample.csv'))
  t.is(error.message, 'An error has occurred: Error: ENOENT: no such file or directory, stat \'test/dist/sample.csv\'')
})

test('Upload file', async t => {
  const read = await fs.createReadStream(path.join(process.cwd(), 'lib', 'storage', 'test', 'fixtures', 'sample.csv'))
  const metadata = await storage.uploadStream(read, 'input')
  await t.notThrowsAsync(fs.access(path.join(uploadPathTest, metadata.filePath)))
})

test('Create download stream', async t => {
  const read = await fs.createReadStream(path.join(process.cwd(), 'lib', 'storage', 'test', 'fixtures', 'sample.csv'))
  const metadata = await storage.uploadStream(read, 'input')

  const downloadStream = await storage.createDownloadStream(metadata.filePath)
  t.true(downloadStream instanceof stream.Stream)
})

test('Create download stream / file not found', async t => {
  const read = await fs.createReadStream(path.join(process.cwd(), 'lib', 'storage', 'test', 'fixtures', 'sample.csv'))
  await storage.uploadStream(read, 'input')

  const error = await t.throwsAsync(() => storage.createDownloadStream('sample.csv'))
  t.is(error.message, 'An error has occurred: Error: ENOENT: no such file or directory, access \'test/dist/sample.csv\'')
})
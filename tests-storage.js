#!/usr/bin/env node
/* eslint import/no-unassigned-import: off */
import 'dotenv/config.js'

import process from 'node:process'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'
import fs from 'fs-extra'
import hasha from 'hasha'

import storage from './lib/storage/index.js'

const file1Mo = '../file1Mo'
const file100Mo = '../file100Mo'
const uploadPath = 'dist'

async function uploadFileToS3(filePath) {
  const readableStream = await fs.createReadStream(filePath)
  const uploadMetadata = await storage.upload(readableStream, 'test')
  return uploadMetadata
}

async function storeDownloadedStream(inputStream, filePath) {
  await pipeline(
    inputStream,
    fs.createWriteStream(path.join(uploadPath, filePath))
  )
}

async function verifyFiles(originalFilePath, downloadedFilePath) {
  const originalFileHash = await hasha.fromFile(originalFilePath, {algorithm: 'md5'})
  const downloadedFileHash = await hasha.fromFile(downloadedFilePath, {algorithm: 'md5'})

  console.log(`md5 original file: ${originalFileHash}`)
  console.log(`md5 downloaded file: ${downloadedFileHash}`)

  if (originalFileHash !== downloadedFileHash) {
    throw new Error('Files are different')
  }
}

async function testFile(originalFilePath) {
  console.log(`testing: ${originalFilePath}`)

  const uploadMetadata = await uploadFileToS3(originalFilePath)
  const filePath = uploadMetadata.Key // 'Key' property refer to the S3 file path

  const downloadStream = await storage.createDownloadStream(filePath)
  await storeDownloadedStream(downloadStream, filePath)

  await verifyFiles(originalFilePath, path.join(uploadPath, filePath))
}

async function main() {
  await testFile(file1Mo) // Test small file
  await testFile(file100Mo) // Test large file
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

#!/usr/bin/env node
/* eslint import/no-unassigned-import: off */
import 'dotenv/config.js'

import {cpus} from 'node:os'
import process from 'node:process'

import pLimit from 'p-limit'
import pumpify from 'pumpify'

import {createGeocodeStream} from 'addok-geocode-stream'
import {validateCsvFromStream, createCsvReadStream} from '@livingdata/tabular-data-helpers'

import {processNext, getInputFileDownloadStream, getProject, setOutputFile, endProcessing, updateProcessing} from './lib/models/project.js'

import {createWriteStream as createGeoJsonWriteStream} from './lib/writers/geojson.js'
import {createWriteStream as createCsvWriteStream} from './lib/writers/csv.js'

import {computeOutputFilename} from './lib/util/filename.js'

const OUTPUT_FORMATS = {
  csv: createCsvWriteStream,
  geojson: createGeoJsonWriteStream
}

const ADDOK_SERVICE_URL = process.env.ADDOK_SERVICE_URL || 'https://api-adresse.data.gouv.fr'

function getConcurrency() {
  if (process.env.WORKERS_CONCURRENCY) {
    return Number.parseInt(process.env.WORKERS_CONCURRENCY, 10)
  }

  return cpus().length
}

async function main() {
  const concurrency = getConcurrency()
  const processingProjects = new Map()
  const limit = pLimit(1)

  async function getNextJob() {
    if (processingProjects.size >= concurrency) {
      return
    }

    const projectId = await processNext()

    if (!projectId) {
      limit.clearQueue()
      return
    }

    const abortController = new AbortController()
    processingProjects.set(projectId, {abortController})

    process.nextTick(async () => {
      await executeProcessing(projectId, {signal: abortController.signal})
      processingProjects.delete(projectId)
      limit(() => getNextJob())
    })
  }

  async function executeProcessing(projectId) {
    try {
      console.log(`${projectId} | start processing`)

      const project = await getProject(projectId)
      const {inputFile} = project

      const upLimit = pLimit(1)

      /* Validation */

      let totalRows = null

      await upLimit(() => updateProcessing(projectId, {
        step: 'validating',
        validationProgress: {readRows: 0, readBytes: 0, totalBytes: inputFile.size}
      }))

      const validationInputStream = await getInputFileDownloadStream(projectId)

      await new Promise((resolve, reject) => {
        const validation = validateCsvFromStream(validationInputStream, project.pipeline)

        validation
          .on('progress', async progress => {
            await upLimit(() => updateProcessing(projectId, {
              validationProgress: {readRows: progress.readRows, readBytes: progress.readBytes, totalBytes: progress.totalBytes}
            }))
          })
          .on('error', async error => {
            await upLimit(() => updateProcessing(projectId, {
              validationError: error.message
            }))
            reject(new Error('Validation failed'))
          })
          .on('complete', async () => {
            totalRows = validation.readRows
            await upLimit(() => updateProcessing(projectId, {
              validationProgress: {readRows: validation.readRows, readBytes: validation.readBytes, totalBytes: validation.totalBytes}
            }))
            resolve()
          })
      })

      /* Geocoding */

      await upLimit(() => updateProcessing(projectId, {
        step: 'geocoding',
        geocodingProgress: {readRows: 0, totalRows}
      }))

      const inputFileName = project.inputFile.filename
      const outputFileName = computeOutputFilename(inputFileName || 'result', outputFormat)

      const {geocodeOptions, outputFormat} = project.pipeline

      const inputFileStream = await getInputFileDownloadStream(projectId)
      const createWriteStream = OUTPUT_FORMATS[outputFormat]

      const fullGeocodeStream = pumpify(
        inputFileStream,
        createCsvReadStream(project.pipeline),
        createGeocodeStream(ADDOK_SERVICE_URL, {
          columns: geocodeOptions.q,
          citycode: geocodeOptions.citycode,
          lon: geocodeOptions.lon,
          lat: geocodeOptions.lat,
          async onUnwrap(readRows) {
            await upLimit(() => updateProcessing(projectId, {
              geocodingProgress: {readRows, totalRows}
            }))
          }
        }),
        createWriteStream()
      )

      try {
        await setOutputFile(projectId, outputFileName, fullGeocodeStream)
      } catch (error) {
        await upLimit(() => updateProcessing(projectId, {
          validationError: error.message
        }))
        throw new Error('Geocoding failed')
      }

      await endProcessing(projectId)

      console.log(`${projectId} | processed successfully`)
    } catch (error) {
      await endProcessing(projectId, error)

      console.log(`${projectId} | error during processing`)
      console.error(error)
    }
  }

  setInterval(() => {
    for (let i = processingProjects.size; i < concurrency; i++) {
      limit(() => getNextJob())
    }
  }, 1000)
}

try {
  await main()
} catch (error) {
  console.error(error)
  process.exit(1)
}

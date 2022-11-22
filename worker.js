#!/usr/bin/env node
/* eslint import/no-unassigned-import: off */
import 'dotenv/config.js'

import {cpus} from 'node:os'
import process from 'node:process'

import pLimit from 'p-limit'
import pumpify from 'pumpify'

import {createGeocodeStream} from 'addok-geocode-stream'
import {validateCsvFromStream, createCsvReadStream} from '@livingdata/tabular-data-helpers'

import {processNext, getInputFileDownloadStream, getProject, setOutputFile, endProcessing} from './lib/models/project.js'

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

      const {geocodeOptions, outputFormat} = project.pipeline
      const createWriteStream = OUTPUT_FORMATS[outputFormat]

      const validationInputStream = await getInputFileDownloadStream(projectId)

      await new Promise((resolve, reject) => {
        validateCsvFromStream(validationInputStream, project.pipeline)
          .on('error', error => reject(error))
          .on('complete', () => resolve())
      })

      const inputFileName = project.inputFile.filename
      const outputFileName = computeOutputFilename(inputFileName || 'result', outputFormat)

      const inputFileStream = await getInputFileDownloadStream(projectId)

      const fullGeocodeStream = pumpify(
        inputFileStream,
        createCsvReadStream(project.pipeline),
        createGeocodeStream(ADDOK_SERVICE_URL, {
          columns: geocodeOptions.q,
          citycode: geocodeOptions.citycode,
          lon: geocodeOptions.lon,
          lat: geocodeOptions.lat
        }),
        createWriteStream()
      )

      await setOutputFile(projectId, outputFileName, fullGeocodeStream)
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

main().catch(error => {
  console.error(error)
  process.exit(1)
})

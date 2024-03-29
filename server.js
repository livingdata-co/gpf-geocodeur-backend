/* eslint import/no-unassigned-import: off */
import 'dotenv/config.js'

import process from 'node:process'
import {pipeline} from 'node:stream/promises'

import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import multer from 'multer'
import createError from 'http-errors'
import contentDisposition from 'content-disposition'
import intoStream from 'into-stream'
import bytes from 'bytes'

import {createGeocodeStream} from 'addok-geocode-stream'
import {validateCsvFromStream, createCsvReadStream} from '@livingdata/tabular-data-helpers'

import {createWriteStream as createGeoJsonWriteStream} from './lib/writers/geojson.js'
import {createWriteStream as createCsvWriteStream} from './lib/writers/csv.js'
import w from './lib/util/w.js'
import errorHandler from './lib/util/error-handler.js'
import {computeOutputFilename} from './lib/util/filename.js'

import {createProject, setPipeline, getProject, getProcessing, checkProjectToken, askProcessing, setInputFile, getOutputFileDownloadStream, deleteProject} from './lib/models/project.js'
import {validatePipeline} from './lib/pipeline.js'

const OUTPUT_FORMATS = {
  csv: createCsvWriteStream,
  geojson: createGeoJsonWriteStream
}

const {ADDOK_SERVICE_URL} = process.env

const app = express()
const upload = multer({
  limits: {
    fileSize: 50 * 1014 * 1024 // 50 MB
  }
})

app.disable('x-powered-by')

app.use(cors({origin: true}))

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}

const ensureProjectToken = w(async (req, res, next) => {
  if (!req.get('Authorization')) {
    throw createError(401, 'Authorization token not provided')
  }

  const token = req.get('Authorization').slice(6)
  const isSameToken = await checkProjectToken(req.params.projectId, token)

  if (!isSameToken) {
    throw createError(401, 'Bad token or bad project')
  }

  next()
})

app.post('/projects', w(async (req, res) => {
  const project = await createProject()
  res.status(201).send(project)
}))

app.get('/projects/:projectId', ensureProjectToken, w(async (req, res) => {
  const project = await getProject(req.params.projectId)
  res.send(project)
}))

app.delete('/projects/:projectId', ensureProjectToken, w(async (req, res) => {
  await deleteProject(req.params.projectId)
  res.sendStatus(204)
}))

app.get('/projects/:projectId/processing', ensureProjectToken, w(async (req, res) => {
  const processing = await getProcessing(req.params.projectId)
  res.send(processing)
}))

app.put('/projects/:projectId/pipeline', ensureProjectToken, express.json(), w(async (req, res) => {
  const pipeline = validatePipeline(req.body)
  await setPipeline(req.params.projectId, pipeline)
  const project = await getProject(req.params.projectId)
  res.send(project)
}))

app.put('/projects/:projectId/input-file', ensureProjectToken, w(async (req, res) => {
  if (!req.get('Content-Disposition') || !req.get('Content-Disposition').includes('filename')) {
    throw createError(400, 'Filename must be provided through Content-Disposition')
  }

  if (!req.get('Content-Length')) {
    throw createError(400, 'File size must be provided through Content-Length')
  }

  const {parameters: {filename}} = contentDisposition.parse(req.get('Content-Disposition'))
  const fileSize = Number.parseInt(req.get('Content-Length'), 10)

  const {userParams} = await getProject(req.params.projectId)

  if (userParams.maxFileSize && fileSize > bytes(userParams.maxFileSize)) {
    throw createError(403, `File too large. Maximum allowed: ${userParams.maxFileSize}`)
  }

  await setInputFile(req.params.projectId, filename, fileSize, req)
  const project = await getProject(req.params.projectId)
  res.send(project)
}))

app.post('/projects/:projectId/start', ensureProjectToken, w(async (req, res) => {
  await askProcessing(req.params.projectId)
  const project = await getProject(req.params.projectId)
  res.status(202).send(project)
}))

app.get('/projects/:projectId/output-file/:token', w(async (req, res) => {
  const project = await getProject(req.params.projectId)

  if (!project || !project.outputFile || project.outputFile.token !== req.params.token) {
    throw createError(403, 'Unable to access to this file')
  }

  const outputFileStream = await getOutputFileDownloadStream(req.params.projectId)

  res.set('Content-Disposition', contentDisposition(project.outputFile.filename))
  res.set('Content-Length', project.outputFile.size)
  res.set('Content-Type', 'application/octet-stream')
  outputFileStream.pipe(res)
}))

const uploadFiles = [
  {name: 'file', maxCount: 1},
  {name: 'options', maxCount: 1}
]

app.post('/geocode', upload.fields(uploadFiles), w(async (req, res) => {
  if (!req.files) {
    throw createError(400, 'Request must contains at least a file')
  }

  const fileField = (req.files.file || [])[0]
  const optionsField = (req.files.options || [])[0]

  if (!fileField) {
    throw createError(400, 'A CSV file must be provided in file field')
  }

  if (optionsField && optionsField.size > 100 * 1024) {
    throw createError(400, 'options field is too big')
  }

  let options = {}

  if (optionsField) {
    try {
      options = JSON.parse(optionsField.buffer.toString())
    } catch {
      throw createError(400, 'options field is not a valid JSON')
    }
  }

  if (options.outputFormat && !OUTPUT_FORMATS[options.outputFormat]) {
    throw createError(400, `Unknown outputFormat: ${options.outputFormat}`)
  }

  // TODO: Validate that. Fields may not exists.
  const geocodeOptions = options.geocodeOptions || {}

  const outputFormat = options.outputFormat || 'csv'
  const createWriteStream = OUTPUT_FORMATS[outputFormat]

  await new Promise((resolve, reject) => {
    const fileStream = intoStream(fileField.buffer)

    validateCsvFromStream(fileStream, options)
      .on('error', error => reject(createError(400, error.message)))
      .on('complete', () => resolve())
  })

  const {originalName} = fileField
  const resultFileName = computeOutputFilename(originalName || 'result', outputFormat)

  res
    .type('csv')
    .set('Content-Disposition', contentDisposition(resultFileName))

  try {
    await pipeline(
      intoStream(fileField.buffer),
      createCsvReadStream(options),
      createGeocodeStream({
        serviceUrl: ADDOK_SERVICE_URL,
        strategy: 'batch',
        columns: geocodeOptions.q,
        citycode: geocodeOptions.citycode,
        lon: geocodeOptions.lon,
        lat: geocodeOptions.lat
      }),
      createWriteStream(),
      res
    )
  } catch (error) {
    res.destroy()
    console.log(error)
  }
}))

app.use(errorHandler)

const port = process.env.PORT || 5000

app.listen(port, () => {
  console.log(`Start listening on port ${port}`)
})

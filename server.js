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
import stringify from 'csv-write-stream'

import {createGeocodeStream} from 'addok-geocode-stream'
import {validateCsvFromStream, createCsvReadStream} from '@livingdata/tabular-data-helpers'

import w from './lib/w.js'
import errorHandler from './lib/error-handler.js'

const ADDOK_SERVICE_URL = process.env.ADDOK_SERVICE_URL || 'https://api-adresse.data.gouv.fr'

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

const uploadFiles = [
  {name: 'file', maxCount: 1},
  {name: 'options', maxCount: 1}
]

app.post('/geocode', upload.fields(uploadFiles), w(async (req, res) => {
  const fileField = req.files.find(f => f.fieldname === 'file')
  const optionsField = req.files.find(f => f.fieldname === 'options')

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

  await new Promise((resolve, reject) => {
    const fileStream = intoStream(fileField.buffer)

    validateCsvFromStream(fileStream, options)
      .on('error', error => reject(createError(400, error.message)))
      .on('complete', () => resolve())
  })

  const {originalName} = fileField
  const resultFileName = originalName ? `geocoded-${originalName}` : 'geocoded.csv'

  res
    .type('csv')
    .set('Content-Disposition', contentDisposition(resultFileName))

  try {
    await pipeline(
      intoStream(fileField.buffer),
      createCsvReadStream(options),
      createGeocodeStream(ADDOK_SERVICE_URL),
      stringify(),
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

import test from 'ava'
import {computeOutputFilename} from '../filename.js'

test('computeOutputFilename', t => {
  t.is(computeOutputFilename('file1.csv', 'csv'), 'file1.geocoded.csv')
  t.is(computeOutputFilename('file1.csv', 'geojson'), 'file1.geocoded.geojson')
  t.is(computeOutputFilename('file1.tsv', 'csv'), 'file1.geocoded.csv')
  t.is(computeOutputFilename('file1.csv.tsv', 'geojson'), 'file1.csv.geocoded.geojson')
  t.is(computeOutputFilename('file1', 'csv'), 'file1.geocoded.csv')
  t.is(computeOutputFilename('file1.', 'csv'), 'file1.geocoded.csv')
  t.is(computeOutputFilename('.file1', 'csv'), '.file1.geocoded.csv')
})

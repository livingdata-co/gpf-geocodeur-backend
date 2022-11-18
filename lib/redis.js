import process from 'node:process'
import {default as Redis} from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379/0'

const redis = new Redis(REDIS_URL)

export default redis

export function readValue(value, type) {
  if (!value) {
    return
  }

  if (type === 'date') {
    return new Date(value)
  }

  if (type === 'object') {
    return JSON.parse(value)
  }

  if (type === 'integer') {
    return Number.parseInt(value, 10)
  }

  if (type === 'float') {
    return Number.parseFloat(value)
  }

  if (type === 'boolean') {
    return value === 'true'
  }

  return value
}

export function writeValue(value) {
  if (!value) {
    return
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === 'number') {
    return value.toString()
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return value
}

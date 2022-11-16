import process from 'node:process'
import {default as Redis} from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379/0'

const redis = new Redis(REDIS_URL)

export default redis

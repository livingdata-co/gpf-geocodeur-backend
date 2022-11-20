import {customAlphabet} from 'nanoid'
import createError from 'http-errors'
import pFilter from 'p-filter'
import {subMinutes, isBefore} from 'date-fns'
import storage from '../storage/index.js'
import {default as redis, hydrateObject, prepareObject} from '../util/redis.js'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')

const metaSchema = {
  id: 'string',
  status: 'string',
  createdAt: 'date',
  updatedAt: 'date',
  userParams: 'object',
  pipeline: 'object',
  inputFile: 'object'
}

const processingSchema = {
  startedAt: 'date',
  finishedAt: 'date',
  heartbeat: 'date'
}

export async function createProject() {
  const id = nanoid(10)
  const token = nanoid(24)
  const status = 'idle'
  const createdAt = new Date()
  const updatedAt = new Date()
  const userParams = {maxFileSize: '50MB'}

  await redis
    .pipeline()
    .hset(`project:${id}:meta`, prepareObject({id, status, createdAt, updatedAt, userParams}))
    .set(`token:${token}`, id)
    .exec()

  return {id, status, token, createdAt, updatedAt, userParams, processing: {}}
}

export async function touchProject(id) {
  await redis.hset(`project:${id}:meta`, prepareObject({updatedAt: new Date()}))
}

export async function checkProjectToken(id, token) {
  if (!id || !token) {
    return false
  }

  const result = await redis.get(`token:${token}`)
  return result === id
}

export async function getProject(id) {
  const meta = await redis.hgetall(`project:${id}:meta`)
  const processing = await redis.hgetall(`project:${id}:processing`)

  if (meta.id) {
    return {
      ...hydrateObject(meta, metaSchema),
      processing: hydrateObject(processing, processingSchema)
    }
  }
}

export async function ensureProjectStatus(id, expectedStatus) {
  const status = await redis.hget(`project:${id}:meta`, 'status')
  if (status !== expectedStatus) {
    throw createError(409, `Unexpected status ${status} for project ${id}`)
  }
}

export async function setPipeline(id, pipeline) {
  await ensureProjectStatus(id, 'idle')
  await redis.hset(`project:${id}:meta`, prepareObject({pipeline, updatedAt: new Date()}))
}

export async function setInputFile(id, filename, inputStream) {
  await ensureProjectStatus(id, 'idle')
  const objectKey = await storage.uploadFile(inputStream, 'input')

  await redis.pipeline()
    .hset(`project:${id}:meta`, prepareObject({
      inputFile: {filename},
      updatedAt: new Date()
    }))
    .set(`project:${id}:input-obj-key`, objectKey)
    .exec()
}

export async function askProcessing(id) {
  await ensureProjectStatus(id, 'idle')
  const ok = await redis.set(`project:${id}:processing-asked`, 1, 'NX')

  if (ok) {
    await redis.pipeline()
      .hset(`project:${id}:meta`, prepareObject({
        status: 'waiting',
        updatedAt: new Date()
      }))
      .del(`project:${id}:processing-asked`)
      .rpush('waiting-queue', id)
      .exec()
  }
}

export async function processNext() {
  const projectId = await redis.lpop('waiting-queue')

  if (!projectId) {
    return
  }

  await redis.pipeline()
    .sadd('processing-list', projectId)
    .hset(`project:${projectId}:meta`, prepareObject({status: 'processing', updatedAt: new Date()}))
    .hset(`project:${projectId}:processing`, prepareObject({startedAt: new Date()}))
    .exec()

  return projectId
}

export async function resetProcessing(id) {
  await redis
    .pipeline()
    .del(`project:${id}:processing-asked`)
    .lrem('waiting-queue', 0, id)
    .srem('processing-list', id)
    .hset(`project:${id}:meta`, prepareObject({status: 'idle', updatedAt: new Date()}))
    .del(`project:${id}:processing`)
    .exec()
}

export async function endProcessing(id) {
  await ensureProjectStatus(id, 'processing')

  await redis
    .pipeline()
    .srem('processing-list', id)
    .hset(`project:${id}:meta`, prepareObject({status: 'completed', updatedAt: new Date()}))
    .hset(`project:${id}:processing`, prepareObject({finishedAt: new Date()}))
    .hrem(`project:${id}:processing`, 'heartbeat')
    .exec()
}

export async function heartbeatProcessing(id) {
  await ensureProjectStatus(id, 'processing')
  await redis.hset(`project:${id}:processing`, prepareObject({heartbeat: new Date()}))
}

export async function getStalledProjects() {
  const processingProjects = await redis.smembers('processing-list')

  return pFilter(processingProjects, async projectId => {
    const heartbeat = await redis.hget(`project:${projectId}:processing`, 'heartbeat')

    if (!heartbeat) {
      return false
    }

    return isBefore(new Date(heartbeat), subMinutes(new Date(), 2))
  })
}
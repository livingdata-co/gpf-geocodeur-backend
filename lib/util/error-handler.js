import multer from 'multer'

export default function errorHandler(err, req, res, _next) {
  if (err) {
    if (err instanceof multer.MulterError) {
      res.status(400).send({
        code: 400,
        message: 'Error process multipart'
      })

      return
    }

    const statusCode = err.statusCode || 500
    const exposeError = statusCode !== 500

    res
      .status(statusCode)
      .send({
        code: statusCode,
        message: exposeError ? err.message : 'An unexpected error has occurred'
      })

    if (statusCode === 500) {
      console.error(err)
    }
  }
}

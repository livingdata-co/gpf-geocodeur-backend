# 1/2 Create build image
FROM node:18-alpine AS build

RUN mkdir /app
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn --production --frozen-lockfile

COPY . .

ENV NODE_ENV=production

EXPOSE 5000

CMD ["node", "server.js"]

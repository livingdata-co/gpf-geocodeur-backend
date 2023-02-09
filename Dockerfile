FROM node:18-alpine

RUN mkdir /app
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn --production --frozen-lockfile

COPY . .

ENV NODE_ENV=production

USER node
EXPOSE 5000
CMD ["node", "server.js"]

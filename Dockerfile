# 1/2 Create build image
FROM node:18-alpine AS build

RUN mkdir -p /gpf-geocodeur-back
WORKDIR /gpf-geocodeur-back

COPY package.json yarn.lock ./
RUN yarn --production --frozen-lockfile

# 2/2 Create production image
FROM node:18-alpine

RUN mkdir -p /gpf-geocodeur-back
WORKDIR /gpf-geocodeur-back

COPY --from=build /gpf-geocodeur-back .
COPY . .

ENV NODE_ENV=production

EXPOSE 5000

CMD ["/bin/sh", "./start.sh"]

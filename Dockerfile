FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts

RUN mkdir -p /app/data && chown -R node:node /app

ENV NODE_ENV=development
USER node

EXPOSE 5000

CMD ["npm", "run", "dev"]

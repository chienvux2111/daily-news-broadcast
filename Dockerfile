FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY src/ ./src/
COPY .env* ./
RUN mkdir -p /app/.cache
VOLUME /app/.cache
ENV NODE_ENV=production
CMD ["node", "src/adapters/node.js", "cron"]

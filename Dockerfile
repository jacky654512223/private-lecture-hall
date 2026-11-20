FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY public ./public
COPY worker ./worker
COPY server ./server
COPY drizzle ./drizzle
RUN node worker/build.mjs && mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=8787 DATA_DIR=/data
EXPOSE 8787
CMD ["node", "server/start.mjs"]

# Stage 1: frontend
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: server
FROM rust:1.96-alpine AS builder
RUN apk add --no-cache musl-dev
WORKDIR /server
COPY server/ ./
RUN cargo build --release

# Stage 3: runtime — single binary + static assets
FROM alpine:3.20
RUN adduser -D app
WORKDIR /app
COPY --from=builder /server/target/release/dominoparty-server ./
COPY --from=web /web/dist ./static
RUN mkdir /data && chown app /data
USER app
ENV PORT=3000 DB_PATH=/data/dominoparty.db STATIC_DIR=/app/static
EXPOSE 3000
VOLUME /data
CMD ["./dominoparty-server"]

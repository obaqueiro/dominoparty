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
# The distroless runtime can only run a fully static binary — fail the build here if
# a dependency ever sneaks in a dynamic link.
RUN ldd target/release/dominoparty-server 2>&1 \
    | grep -qi "statically linked\|not a dynamic executable\|not a valid dynamic program" \
    && mkdir /data

# Stage 3: runtime — static binary + assets only, no shell/package manager
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=builder /server/target/release/dominoparty-server ./
COPY --from=web /web/dist ./static
COPY --from=builder --chown=nonroot:nonroot /data /data
ENV PORT=3000 DB_PATH=/data/dominoparty.db STATIC_DIR=/app/static
EXPOSE 3000
VOLUME /data
CMD ["./dominoparty-server"]

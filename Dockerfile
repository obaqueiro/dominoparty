# Stage 1: frontend
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: server
FROM rust:1.96-alpine AS builder
RUN apk add --no-cache musl-dev binutils
WORKDIR /server
COPY server/ ./
# rust:alpine ships RUSTFLAGS="-C target-feature=-crt-static" (dynamic musl);
# override it — the distroless/static runtime needs a fully static binary.
ENV RUSTFLAGS="-C target-feature=+crt-static"
# Building with an explicit --target keeps RUSTFLAGS off host proc-macros
# (which cannot be built static).
RUN target=$(rustc -vV | sed -n 's/host: //p') \
    && cargo build --release --target "$target" \
    && cp "target/$target/release/dominoparty-server" target/release/
# Fail the build if a dependency ever sneaks in a dynamic link (no NEEDED
# entries means fully static; ldd is unreliable for static-PIE on musl).
RUN ! readelf -d target/release/dominoparty-server | grep -q NEEDED \
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

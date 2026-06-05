# syntax=docker/dockerfile:1.7
#
# Multi-stage Go build → distroless runtime image for the EndorseKit
# backend service (endorsement-PDF generation, the booking/lesson reminder
# cron, and Stripe Connect invoicing). Designed for Cloud Run us-central1.
#
# NOTE: this Dockerfile expects backend/go.mod + Go sources to exist. Until
# Phase 5 / M2 lands them, `.woodpecker/deploy.yml`'s backend-preflight step
# soft-skips (exit 78) when go.mod is absent.

FROM golang:1.26-alpine AS build
WORKDIR /src

# Cache module downloads on go.{mod,sum} changes only.
COPY go.mod ./
RUN go mod download

# Build the server binary with version metadata.
COPY . .
ARG APP_VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w -X main.Version=${APP_VERSION}" \
    -o /out/server ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=build /out/server /server
USER nonroot:nonroot
EXPOSE 8080
ENV PORT=8080
ENTRYPOINT ["/server"]

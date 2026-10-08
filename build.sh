#!/bin/bash
# Clean macOS resource fork files that break Docker builds
find . -name "._*" -type f -delete
find . -name ".DS_Store" -type f -delete
find . -name ".AppleDouble" -type d -delete

# Build and start Docker
docker compose build --no-cache && docker compose up -d

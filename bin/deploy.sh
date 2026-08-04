#!/bin/zsh
# Cloudflare Pagesへのデプロイ。git管理下のファイルのみを展開してから上げることで、
# testdata/dumps/ 等の個人データ（gitignore済み）を絶対に含めない。
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="gekichumai-card-3e325b"
DIR="$(mktemp -d)"
git archive HEAD | tar -x -C "$DIR"
ASDF_NODEJS_VERSION=22.22.0 npx wrangler pages deploy "$DIR" --project-name="$PROJECT" --branch=main
rm -rf "$DIR"

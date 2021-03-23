#!/bin/sh

set -e
export CI=true

npm install
npm run build

SHELL = /bin/sh
VERSION ?= $(shell git describe --tags 2>/dev/null || echo development)
COMMIT ?= $(shell git rev-parse HEAD 2>/dev/null)
DATE ?= $(shell date -u)
export CGO_ENABLED=0

CLI_LDFLAGS = -X 'main.version=$(VERSION)' -X 'main.buildCommit=$(COMMIT)' -X 'main.buildTime=$(DATE)'
CLI_PLATFORMS ?= linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64

babylon:
	go build -ldflags="$(CLI_LDFLAGS)" -o build/babylon .

babylon-cross:
	@mkdir -p build
	@for platform in $(CLI_PLATFORMS); do \
		os=$${platform%/*}; \
		arch=$${platform#*/}; \
		output=build/babylon-$${os}-$${arch}; \
		if [ "$$os" = "windows" ]; then output=$${output}.exe; fi; \
		echo "Building $$output ..."; \
		GOOS=$$os GOARCH=$$arch go build -ldflags="$(CLI_LDFLAGS)" -o $$output . || exit 1; \
	done
	@echo "Done. Binaries:"
	@ls -lh build/babylon-*
	@echo sha256sums:
	@echo '```'
	@cd build && sha256sum babylon-*
	@echo '```'

clean:
	rm -f build/babylon*

.PHONY: babylon babylon-cross clean

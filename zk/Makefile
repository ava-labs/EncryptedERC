export GO111MODULE=on

SOURCE_DIRS = cmd pkg

.PHONY: vendor fmtcheck clean build gotest gobench mod-clean

all: fmtcheck build gotest mod-clean

vendor:
	go mod vendor

vetcheck:
	go vet ./...
	golangci-lint run

clean:
	rm -rf build/

build:
	go build -o ./build/encryptedERC ./cmd/

mod-clean:
	go mod tidy

mock:
	@echo "No mocks"
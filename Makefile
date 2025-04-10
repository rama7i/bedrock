reload:
	docker compose build
	docker compose down
	docker compose up --build

down:
	docker compose down

build:
	docker compose build

up:
	docker compose up

stop:
	docker compose stop

logs:
	docker compose logs -f

bash:
	docker compose exec app bash

npm:
	docker run --rm -v $(PWD):/app -w /app -u node node:18-alpine npm $(cmd)

install:
	docker run --rm -v $(PWD):/app -w /app -u node node:18-alpine npm install

fix-permissions:
	docker run --rm -v $(PWD):/app -w /app node:18-alpine chown -R node:node /app


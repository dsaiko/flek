.PHONY: help setup dev build preview verify cards assets all clean distclean \
        deploy-s3 deploy-s3-dryrun deploy-invalidate deploy

# Lokální deployment konfigurace. Makefile.local je záměrně v .gitignore.
-include Makefile.local

S3_BUCKET        ?=
AWS_PROFILE      ?=
CLOUDFRONT_DIST  ?=

PREVIEW_PORT     ?= 8083

# Web má VLASTNÍ bucket (flek.saiko.cz) a syncuje se do jeho kořene s --delete.
# Tvrdý guard: nikdy nesmí mířit na jiný (sdílený) bucket, ani překlepem.
EXPECTED_BUCKET  := flek.saiko.cz

help:
	@echo "Flek! — online mariáš — dostupné cíle:"
	@echo "  make setup              — instalace závislostí"
	@echo "  make dev                — vývojový server"
	@echo "  make build              — typecheck + statický build do dist/"
	@echo "  make preview            — náhled produkčního buildu"
	@echo "  make verify             — testy enginu (scripts/verify.ts)"
	@echo "  make cards              — přegenerování SVG sad karet (modern, modern-en)"
	@echo "  make assets             — příprava public/cards/ (kopie SVG + WebP historické sady)"
	@echo "  make all                — verify + build"
	@echo ""
	@echo "  make deploy             — build, upload na S3, invalidace CloudFront"
	@echo "  make deploy-s3-dryrun   — ukáže změny na S3 bez uploadu"
	@echo ""
	@echo "Live URL: https://flek.saiko.cz"

node_modules: package.json
	npm install

setup: node_modules

dev: node_modules assets
	npm run dev

build: node_modules assets
	npm run build

preview: build
	npm run preview -- --host 127.0.0.1 --port $(PREVIEW_PORT)

verify: node_modules
	npm run verify

cards: node_modules
	npm run cards

assets: node_modules
	npm run assets

all: verify build

clean:
	rm -rf dist public/cards

distclean: clean
	rm -rf node_modules

define CHECK_DEPLOY_VARS
	@test -n "$(AWS_PROFILE)" || { echo "AWS_PROFILE není nastaven — vytvoř Makefile.local"; exit 1; }
	@test "$(S3_BUCKET)" = "$(EXPECTED_BUCKET)" || { echo "S3_BUCKET musí být přesně '$(EXPECTED_BUCKET)' (--delete v kořeni bucketu!)"; exit 1; }
endef

# Pořadí uploadu: nejdřív hashované assety, index.html jako poslední —
# minimalizuje okno nekonzistence při nasazení.
deploy-s3: build
	$(CHECK_DEPLOY_VARS)
	@echo "→ s3://$(S3_BUCKET)/"
	aws s3 sync --profile $(AWS_PROFILE) ./dist/ s3://$(S3_BUCKET)/ --delete --exclude "index.html"
	aws s3 cp --profile $(AWS_PROFILE) ./dist/index.html s3://$(S3_BUCKET)/index.html

deploy-s3-dryrun: build
	$(CHECK_DEPLOY_VARS)
	aws s3 sync --profile $(AWS_PROFILE) ./dist/ s3://$(S3_BUCKET)/ --delete --dryrun

deploy-invalidate:
	@test -n "$(AWS_PROFILE)"     || { echo "AWS_PROFILE není nastaven — vytvoř Makefile.local"; exit 1; }
	@test -n "$(CLOUDFRONT_DIST)" || { echo "CLOUDFRONT_DIST není nastaven — vytvoř Makefile.local"; exit 1; }
	@echo "→ invalidace /*"
	aws cloudfront create-invalidation \
		--profile $(AWS_PROFILE) \
		--distribution-id $(CLOUDFRONT_DIST) \
		--paths "/*"

deploy: deploy-s3 deploy-invalidate

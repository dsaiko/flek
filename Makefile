.PHONY: help setup dev build preview verify cards assets capture smoke all clean distclean \
        deploy-s3 deploy-s3-dryrun deploy-invalidate deploy-prune deploy

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
	@echo "  make cards              — přegenerování SVG sad karet (modern, -en, -de, -fr)"
	@echo "  make assets             — příprava public/ (karty, WebP historické sady, ikony na plochu)"
	@echo "  make smoke              — browser testy (Playwright: Chromium + WebKit)"
	@echo "  make capture            — snímek úvodní obrazovky pro README"
	@echo "  make all                — verify + build + smoke"
	@echo ""
	@echo "  make deploy             — build, upload na S3, invalidace CloudFront, úklid starých souborů"
	@echo "  make deploy-s3-dryrun   — ukáže změny na S3 bez uploadu"
	@echo ""
	@echo "Live URL: https://flek.saiko.cz"

# `npm install` mtime adresáře nemění → bez touch by se spouštěl při každém cíli
node_modules: package.json package-lock.json
	npm install
	@touch node_modules

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

# Preview na pozadí pro smoke/capture. Na portu nesmí nic běžet: testy by jinak
# tiše šly proti cizímu serveru (astro preview se u obsazeného portu ukončí).
# Astro 7 se mimo terminál samo odpojí do pozadí (rodič je pak init), takže
# `kill $$!` nic nezabije — server zastaví až `astro preview stop`.
define PREVIEW_BG
if curl -s -o /dev/null http://127.0.0.1:$(PREVIEW_PORT)/; then \
	    echo "Port $(PREVIEW_PORT) už je obsazený — ukonči běžící preview (lsof -i :$(PREVIEW_PORT))"; exit 1; \
	  fi; \
	  trap "node_modules/.bin/astro preview stop > /dev/null 2>&1" EXIT; \
	  node_modules/.bin/astro preview --background --host 127.0.0.1 --port $(PREVIEW_PORT) > /dev/null || exit 1; \
	  for i in 1 2 3 4 5 6 7 8 9 10; do \
	    curl -sf http://127.0.0.1:$(PREVIEW_PORT)/ > /dev/null && break || sleep 1; \
	  done; \
	  curl -sf http://127.0.0.1:$(PREVIEW_PORT)/ > /dev/null || { echo "preview nenaběhl:"; node_modules/.bin/astro preview logs; exit 1; };
endef

# Browser testy: to, co bez DOM otestovat nejde (popup přes přepnutí jazyka,
# zrušení opuštěných animací, porušení CSP). Spouští preview na pozadí a po
# doběhnutí ho zabije.
smoke: build
	@$(PREVIEW_BG) \
	  npm run smoke -- http://127.0.0.1:$(PREVIEW_PORT)/?seed=10

# Snímek úvodní obrazovky pro README — stejné schéma jako smoke (preview na
# pozadí, po doběhnutí se zabije). Scéna je deterministická (seed + pevné
# dekorační karty), takže opakovaný běh nedělá v gitu šum.
capture: build
	@$(PREVIEW_BG) \
	  npm run capture -- 'http://127.0.0.1:$(PREVIEW_PORT)/?seed=1993&lang=en'

all: verify build smoke

clean:
	rm -rf dist public/cards

distclean: clean
	rm -rf node_modules

define CHECK_DEPLOY_VARS
	@test -n "$(AWS_PROFILE)" || { echo "AWS_PROFILE není nastaven — vytvoř Makefile.local"; exit 1; }
	@test "$(S3_BUCKET)" = "$(EXPECTED_BUCKET)" || { echo "S3_BUCKET musí být přesně '$(EXPECTED_BUCKET)' (--delete v kořeni bucketu!)"; exit 1; }
endef

# Pořadí uploadu: nejdřív hashované assety, index.html jako poslední. Staré
# soubory se NEmažou tady — starý index.html (v cache CloudFrontu do doběhnutí
# invalidace, v otevřených záložkách déle) na ně pořád odkazuje. Úklid dělá
# `deploy-prune` až po invalidaci. Cache-Control přidávají response headers
# policies CloudFrontu (flek-html / flek-hashed), ne S3.
deploy-s3: build
	$(CHECK_DEPLOY_VARS)
	@echo "→ s3://$(S3_BUCKET)/"
	aws s3 sync --profile $(AWS_PROFILE) ./dist/ s3://$(S3_BUCKET)/ --exclude "index.html"
	aws s3 cp --profile $(AWS_PROFILE) ./dist/index.html s3://$(S3_BUCKET)/index.html

# smaže z bucketu, co v dist/ už není (po invalidaci)
deploy-prune:
	$(CHECK_DEPLOY_VARS)
	aws s3 sync --profile $(AWS_PROFILE) ./dist/ s3://$(S3_BUCKET)/ --delete --exclude "index.html"

deploy-s3-dryrun: build
	$(CHECK_DEPLOY_VARS)
	aws s3 sync --profile $(AWS_PROFILE) ./dist/ s3://$(S3_BUCKET)/ --delete --dryrun

deploy-invalidate:
	@test -n "$(AWS_PROFILE)"     || { echo "AWS_PROFILE není nastaven — vytvoř Makefile.local"; exit 1; }
	@test -n "$(CLOUDFRONT_DIST)" || { echo "CLOUDFRONT_DIST není nastaven — vytvoř Makefile.local"; exit 1; }
	@echo "→ invalidace /*"
	@ID=$$(aws cloudfront create-invalidation \
		--profile $(AWS_PROFILE) \
		--distribution-id $(CLOUDFRONT_DIST) \
		--paths "/*" --query Invalidation.Id --output text) && \
	  echo "   $$ID — čekám na dokončení" && \
	  aws cloudfront wait invalidation-completed --profile $(AWS_PROFILE) \
		--distribution-id $(CLOUDFRONT_DIST) --id $$ID

# Invalidace MUSÍ jít až po nahrání — jinak by CloudFront s `make -j` mohl
# naplnit cache starým obsahem ještě před dokončením syncu.
.NOTPARALLEL:

deploy: deploy-s3
	@$(MAKE) deploy-invalidate
	@$(MAKE) deploy-prune

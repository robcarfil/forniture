# GenerApp

Web app Next.js esportata come sito statico e servita da Nginx. Il repository
include un chart Helm e una struttura catalogo compatibile con TrueNAS SCALE
per installazioni che supportano cataloghi Kubernetes/Helm.

## Versione applicazione

La versione dell'app è centralizzata in `package.json` e resa disponibile anche via API:

```bash
npm run version:show
curl http://localhost:30090/api/version
```

Quando vuoi pubblicare una nuova release, aggiorna prima la versione in `package.json` e poi usa lo stesso valore anche come build arg in Docker/Compose.

## Inizializzazione database

Il database MySQL viene creato e inizializzato con lo script dedicato:

```bash
docker compose up -d mariadb
npm run db:init
```

Lo script crea le tabelle principali del sistema e poi puoi creare il primo amministratore tramite l'endpoint di setup:

```bash
curl -X POST http://localhost:30090/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Password123!"}'
```

L'endpoint crea il primo admin solo se il database è ancora vuoto.

## Sviluppo locale con hot reload

Per lavorare sul codice senza ricostruire manualmente l'immagine, usa il compose dedicato allo sviluppo:

```bash
docker compose -f docker-compose.dev.yaml up --build
```

Questo monta la cartella del progetto dentro il container e lancia `next dev`, così ogni modifica ai file viene rilevata automaticamente senza fare `npm run build` a mano.

## Parser fatture personalizzati

L'app include un framework base per parsare PDF di fatture in modo riutilizzabile e facilmente estendibile: `lib/invoice-parsers.js` e le route `POST /api/invoices/parse` / `POST /api/fatture/parse`.

Il flusso è:

1. estrae il testo dal PDF
2. rileva il template più probabile o il parser dedicato al fornitore
3. applica regole di matching per numero fattura, data, importo, IVA e fornitore
4. restituisce un JSON strutturato con `template`, `confidence` e `fields`
5. nella pagina `Fatture forniture` il file caricato viene analizzato e i campi rilevati vengono precompilati nel form e poi salvati direttamente nella tabella `supply_invoices`

I parser sono centralizzati in un registry in `lib/invoice-parsers.js`, così è semplice aggiungere un parser custom per ogni fornitore e raffinarlo con nuove regole in base ai PDF reali ricevuti.

Esempio di chiamata:

```bash
curl -X POST http://localhost:30090/api/invoices/parse \
  -H "Cookie: generapp_session=..." \
  -F "file=@example-fattura.pdf"
```

Per generare un set di fixture PDF di prova e usarle come baseline di regressione:

```bash
npm run generate:invoice-fixtures
```

Per verificare la regressione del parser con fixture PDF e valori attesi:

```bash
npm run test:invoice-parser
```

Per raffinire il parser in modo sicuro:

1. raccogli un campione di PDF reali per ogni fornitore o layout;
2. apri `Fornitori → Parser` e carica il PDF campione reale;
3. mappa visivamente i campi principali sul documento e salva coordinate + regex;
4. inserisci i valori attesi per validare automaticamente il campione (`expected`);
5. usa `Confronta fixture` per verificare se output reale e atteso coincidono;
6. aggiungi nuove regole o correzioni solo se il confronto evidenzia differenze;
7. versiona il parser e mantieni fixture di regressione per evitare regressioni future.

Questo permette di creare più parser specializzati su diversi PDF, senza affidarsi a un unico parser generico per tutti i fornitori.

## Build immagine

```bash
docker build --build-arg APP_VERSION=$(node -p "require('./package.json').version") -t 100.119.243.68:30142/gestore/generapp:$(node -p "require('./package.json').version") .
docker push 100.119.243.68:30142/gestore/generapp:$(node -p "require('./package.json').version")
```

## Test locale

```bash
docker run --rm -p 8080:8080 100.119.243.68:30142/gestore/generapp:1.0.0
```

Apri `http://localhost:8080`.

## TrueNAS SCALE: Custom App

Il file `custom-app.yaml` contiene la configurazione da usare in **Apps →
Discover Apps → Custom App → Install via YAML** (il nome delle voci può
variare leggermente tra le versioni di SCALE). Il container ascolta sulla
porta `8080` e viene pubblicato sulla porta TrueNAS `30080`.

Nota: TrueNAS Custom App non compila un `Dockerfile` e non importa un archivio
`.tar` come immagine. Prima bisogna pubblicare l'immagine in un registry
raggiungibile da TrueNAS; il `.tar` allegato serve a trasferire sorgenti,
Dockerfile e configurazione.

### Trasferimento dal Mac

Sostituisci `ADMIN` con l'utente SSH di TrueNAS e trasferisci l'archivio nella
directory già presente:

```bash
scp generapp-truenas-1.0.0.tar ADMIN@truenas:/mnt/ONE-TB/tank/projects/
ssh ADMIN@truenas
sudo -i
cd /mnt/ONE-TB/tank/projects
mkdir -p generapp-1.0.0
tar -xf generapp-truenas-1.0.0.tar -C generapp-1.0.0
```

Per copiare un file dal Mac il formato è sempre `scp FILE UTENTE@HOST:PERCORSO`.
Se SSH usa una porta diversa, aggiungi `-P PORTA`.

### Build e push dell'immagine

Da un host che raggiunga il registry e abbia Docker:

```bash
cd generapp-1.0.0
docker login 100.119.243.68:30142
docker build -t 100.119.243.68:30142/gestore/generapp:1.0.0 .
docker push 100.119.243.68:30142/gestore/generapp:1.0.0
```

Se il registry usa HTTP o un certificato non riconosciuto, va configurato
prima come registry insecure/trusted sul demone Docker che esegue il build e
sul nodo TrueNAS; non inserire credenziali nel file YAML.

### Deploy

1. Apri **Apps → Discover Apps → Custom App**.
2. Scegli **Install via YAML** e incolla il contenuto di `custom-app.yaml`.
3. Imposta il nome dell'app, ad esempio `generapp`.
4. Seleziona **Install** e attendi che il container sia `Running`.
5. Apri `http://IP_DI_TRUENAS:30080`.

In alternativa imposta manualmente: immagine
`100.119.243.68:30142/gestore/generapp:1.0.0`, porta container `8080`, porta
host `30080`, protocollo TCP. Non serve un volume: l'app è statica.

## Struttura catalogo TrueNAS

Il catalogo è in `catalog/charts/generapp/1.0.0`.

Per pubblicarlo:

1. Crea un repository Git raggiungibile da TrueNAS, per esempio `https://github.com/tuo-utente/truenas-generapp-catalog`.
2. Pubblica l'intera cartella `catalog` nel repository.
3. In TrueNAS SCALE apri `Apps`, poi `Discover Apps`, quindi `Manage Catalogs` o `Add Catalog`.
4. Imposta il repository Git del catalogo, branch `main` e train `charts`.
5. Sincronizza il catalogo e installa `GenerApp` dalla lista.

## Aggiornamento

1. Builda e pubblica una nuova immagine, per esempio `100.119.243.68:30142/gestore/generapp:1.0.1`.
2. Aggiorna `appVersion` e `version` in `catalog/charts/generapp/1.0.0/Chart.yaml`, oppure crea una nuova directory versione `catalog/charts/generapp/1.0.1`.
3. Aggiorna `image.tag` in `catalog/charts/generapp/1.0.0/values.yaml` e `ix_values.yaml`.
4. Commit e push del catalogo.
5. In TrueNAS usa `Refresh Catalog` e poi aggiorna l'app installata.


tar --exclude='./.git' \
    --exclude='./node_modules' \
    --exclude='./.next' \
    --exclude='./out' \
    --exclude='./.DS_Store' \
    --exclude='./.data' \
    --exclude='./.env' \
    --exclude='./generapp-truenas-*.tar' \
    -cf generapp-truenas-1.3.2.tar .

ls -lh generapp-truenas-1.3.2.tar

scp /Users/robertoformentin/ProgettoQuasar/generapp/generapp-truenas-1.3.3.tar \
admin@100.119.243.68:/mnt/ONE-TB/tank/projects/

### Deploy automatico in produzione

Lo script sostituisce il codice nella directory remota, preserva il file `.env`
di produzione e ricrea i container con Docker Compose:

```bash
chmod +x scripts/deploy-production.sh
./scripts/deploy-production.sh 1.3.6
```

Per usare un altro server o una directory diversa:

```bash
DEPLOY_HOST=admin@HOST DEPLOY_DIR=/percorso/generapp ./scripts/deploy-production.sh 1.3.6
```

Se non usi una chiave SSH, puoi passare la password tramite `sshpass`:

```bash
brew install hudochenkov/sshpass/sshpass
DEPLOY_PASSWORD='la-password' ./scripts/deploy-production.sh 1.3.6
```

È preferibile usare una chiave SSH, perché la password può restare nella
cronologia della shell se viene scritta direttamente nella stessa riga.

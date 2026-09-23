# GenerApp

Web app Next.js esportata come sito statico e servita da Nginx. Il repository
include un chart Helm e una struttura catalogo compatibile con TrueNAS SCALE
per installazioni che supportano cataloghi Kubernetes/Helm.

## Build immagine

```bash
docker build -t 100.119.243.68:30142/gestore/generapp:1.0.0 .
docker push 100.119.243.68:30142/gestore/generapp:1.0.0
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

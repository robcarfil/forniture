# GenerApp

Web app Next.js esportata come sito statico e servita da Nginx. Il repository
include un chart Helm e una struttura catalogo compatibile con TrueNAS SCALE
per installazioni che supportano cataloghi Kubernetes/Helm.

## Build immagine

```bash
docker build -t ghcr.io/robertoformentin/generapp:1.0.0 .
docker push ghcr.io/robertoformentin/generapp:1.0.0
```

## Test locale

```bash
docker run --rm -p 8080:8080 ghcr.io/robertoformentin/generapp:1.0.0
```

Apri `http://localhost:8080`.

## Struttura catalogo TrueNAS

Il catalogo è in `catalog/charts/generapp/1.0.0`.

Per pubblicarlo:

1. Crea un repository Git raggiungibile da TrueNAS, per esempio `https://github.com/tuo-utente/truenas-generapp-catalog`.
2. Pubblica l'intera cartella `catalog` nel repository.
3. In TrueNAS SCALE apri `Apps`, poi `Discover Apps`, quindi `Manage Catalogs` o `Add Catalog`.
4. Imposta il repository Git del catalogo, branch `main` e train `charts`.
5. Sincronizza il catalogo e installa `GenerApp` dalla lista.

## Aggiornamento

1. Builda e pubblica una nuova immagine, per esempio `ghcr.io/robertoformentin/generapp:1.0.1`.
2. Aggiorna `appVersion` e `version` in `catalog/charts/generapp/1.0.0/Chart.yaml`, oppure crea una nuova directory versione `catalog/charts/generapp/1.0.1`.
3. Aggiorna `image.tag` in `catalog/charts/generapp/1.0.0/values.yaml` e `ix_values.yaml`.
4. Commit e push del catalogo.
5. In TrueNAS usa `Refresh Catalog` e poi aggiorna l'app installata.

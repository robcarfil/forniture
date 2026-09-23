# GenerApp

GenerApp è una web app statica Next.js servita da Nginx e confezionata per
TrueNAS SCALE tramite catalogo Helm.

Configurazioni principali:

- immagine e tag del container;
- porta applicativa e tipo servizio Kubernetes;
- NodePort opzionale;
- variabili ambiente;
- storage persistente opzionale;
- ingress opzionale.

# geocodeur-backend

Composants backend du géocodeur de fichiers d'adresses (expérimentation Géoplateforme)

## Pré-requis

- Node.js LTS 18
- Yarn package manager

## Procédure d'installation

### Installation des dépendances

```bash
yarn # ou yarn --prod
```

### Configuration

Plusieurs variables d'environnement doivent ou peuvent être définies pour le fonctionnement du service.

| Nom de la variable | Description | Requise ? |
| --- | --- | --- |
| `PORT` | Port d'écoute pour l'API | |
| `ADDOK_SERVICE_URL` | URL du service addok-server | Oui |
| `REDIS_URL` | Chaîne de connexion à la base de données Redis | |
| `STORAGE_FS_DIR` | Répertoire de stockage Filesystem | |
| `STORAGE_S3_REGION` | Région S3 | |
| `STORAGE_S3_ENDPOINT` | Endpoint S3 | |
| `STORAGE_S3_BUCKET_NAME` | Nom du bucket S3 | |
| `STORAGE_S3_ACCESS_KEY` | Access key S3 | |
| `STORAGE_S3_SECRET_KEY` | Secret key S3 | |

NB : Au moins un dispositif de stockage doit être défini.

Le fichier `.env.sample` peut servir à créer un fichier `.env` qui sera utilisé par le service. Les variables d'environnement peuvent aussi être définies par tout moyen standard.

### Démarrer les services

```bash
node server.js
```

```bash
node worker.js
```

## Développement

```bash
# Lancer les tests
yarn test

# Vérifier la syntaxe et les conventions d'écriture du code source
yarn lint
```

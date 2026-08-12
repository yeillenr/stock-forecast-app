# Stockflow — Prévision des ventes & optimisation des stocks

Application de prévision des ventes (Prophet) et de suivi de couverture de
stock, composée de deux parties :

- **`backend/`** — API Python (FastAPI) : import des données, entraînement
  Prophet par produit, calcul du statut de stock.
- **`frontend/`** — Interface web (Next.js + TypeScript) : upload des
  fichiers, dashboard de statut de stock, visualisation des prévisions.

## 1. Lancer le backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows : venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000 --app-dir app
```

L'API est alors disponible sur `http://localhost:8000`
(documentation interactive sur `http://localhost:8000/docs`).

> **Note sur Prophet** : l'installation peut prendre quelques minutes car
> Prophet dépend de `cmdstanpy`, qui compile un binaire Stan à l'installation.
> C'est normal, laissez l'installation se terminer.

## 2. Lancer le frontend

Dans un second terminal :

```bash
cd frontend/app
npm install
npm run dev
```

L'application est disponible sur `http://localhost:3000`.

Le fichier `.env.local` contient l'URL de l'API :
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 3. Utilisation

1. **Importer** (`/upload`) : importez votre historique de ventes, puis votre
   stock actuel. Vous pouvez tester avec les fichiers fournis dans
   `examples/sales_example.csv` et `examples/stock_example.csv`.
2. **Prévisions** (`/forecast`) : choisissez un horizon (7 à 90 jours) et
   lancez la prévision. Un modèle Prophet est entraîné indépendamment pour
   chaque produit détecté dans les ventes. Consultez la courbe par produit.
3. **Statut du stock** (`/`) : une fois une prévision calculée, cette page
   affiche pour chaque produit sa couverture en jours (stock actuel ÷ demande
   moyenne prédite), la date de rupture estimée, et un statut :
   - **OK** — stock confortable
   - **À commander** — sous le seuil de réapprovisionnement
   - **Critique** — la couverture ne dépasse plus le délai de livraison
   - **Rupture** — stock à 0 alors que la demande est non nulle

## Format des fichiers attendus

> Prophet a besoin d'un minimum de **10 jours de données** par produit pour
> produire une prévision fiable. En dessous, le produit est ignoré (et listé
> comme tel dans la réponse de l'API).

### Fichier de stock (CSV ou Excel)

| Colonne             | Obligatoire | Description                                          |
|---------------------|-------------|--------------------------------------------------------|
| `product_id`        | oui         | Identifiant produit / SKU (doit correspondre aux ventes)|
| `stock_quantity`    | oui         | Quantité actuellement en stock                        |
| `product_name`      | non         | Nom lisible du produit                                 |
| `lead_time_days`    | non (défaut 7) | Délai de livraison fournisseur en jours            |
| `safety_stock_days` | non (défaut 3) | Marge de sécurité en jours                         |

## Architecture & choix techniques

- **Un modèle Prophet par produit** (pas un modèle global) : chaque produit
  peut avoir sa propre saisonnalité, c'est plus précis dès que les produits
  ont des dynamiques différentes.
- **Stockage en fichiers parquet** (`backend/data/`) plutôt qu'une base de
  données : suffisant pour un usage mono-utilisateur / prototype. Pour passer
  en production multi-utilisateurs, remplacez `data_store.py` par une vraie
  base (Postgres, etc.) — les endpoints de `main.py` n'ont pas besoin de
  changer.
- **CORS** : le backend autorise par défaut `http://localhost:3000`. Modifiez
  `allow_origins` dans `backend/main.py` si vous déployez ailleurs.

## Prochaines étapes possibles

- Authentification multi-utilisateurs
- Historisation des imports (versioning des fichiers)
- Export CSV des recommandations de réapprovisionnement
- Alertes email/Slack quand un produit passe en statut "critique"
- Prise en compte de plusieurs entrepôts / emplacements de stock

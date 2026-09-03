# Stockflow — Prévision de la demande et trajectoire de stock

Application de suivi de couverture de stock, composée de :

- **`backend/`** — API Python (FastAPI) : import des mouvements D365, prévision de demande (Prophet seulement s'il bat une baseline), simulation d'inventaire.
- **`frontend/`** — Interface web (Next.js + TypeScript).

## 1. Lancer le backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows : venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000 --app-dir app
```

L'API est disponible sur `http://localhost:8000` (`/docs` pour l'OpenAPI).

Python 3.13 est supporté (`pandas` récent, sans `pyarrow` piné).

## 2. Lancer le frontend

```bash
cd frontend
npm install
npm run dev
```

Application : `http://localhost:3000`.

URL de l'API, dans `frontend/.env.local` si besoin :

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 3. Utilisation

1. **Données** (`/upload`) : Excel/CSV D365. Colonnes minimales : `Date physique`, `Quantité`, `Entrepôt`. `Réception` et `Stock en sortie` permettent de distinguer ventes, achats et transferts.
2. **Entrepôts** (`/warehouses`) : stock actuel, délai, stock min. Ces valeurs ne sont **pas** écrasées par une simulation.
3. **Prévisions** (`/forecast`) : hold-out chronologique, mois incomplets exclus. Prophet n'est servi que s'il bat une naïve / moyenne.
4. **Simulateur** : trajectoire de stock P10 / P50 / P90 (demande haute / médiane / basse).
5. **Tableau de bord** : statut dérivé de cette trajectoire (rupture / critique / à commander / OK).

## Méthode (demande et stock)

- Agrégat **mensuel** après exclusion du dernier mois incomplet.
- Baselines : naïve, moyenne, naïve saisonnière. Prophet : `yhat ≥ 0`, saisonnalité annuelle seulement si ≥ 24 mois, `fourier_order=3`, peu de changepoints.
- Le stock n'est pas un second Prophet : `stock[t] = stock[t-1] - demande[t]`.
- Dépôt trop court (ex. DP1608) : pooling avec le dépôt lié (DP1602) ou baseline.
- Hyperparamètres hors-ligne : `python analysis/select_hyperparameters.py` depuis `backend/`.

Détail et diagnostics : `docs/analyse-methodologique-ml.md`.

## Format des fichiers

Fichier de mouvements (CSV ou Excel) :

| Colonne | Obligatoire | Rôle |
|---|---|---|
| `Date physique` | oui | Date du mouvement |
| `Quantité` | oui | kg (signe ignoré, le type vient des colonnes suivantes) |
| `Entrepôt` | oui | Code dépôt |
| `Stock en sortie` | non | `Vendu` → vente |
| `Réception` | non | `Acheté` → achat |
| `Référence` | non | `Transfert` → transfert in/out selon le signe |

Un fichier sans ces colonnes (ex. rapprochement D365 mal formé) est **ignoré** avec un message 400, pas une erreur 500.

# Analyse méthodologique — prévision de la demande et du stock

Document de travail pour le mémoire de stage.  
Branche : `analyse/methodologie-ml`.  
Mesures reproduites le 2026-09-03 sur `backend/data/cleaned/cleaned_data.csv` et les fichiers d’import D365.

Les corrections du §10 sont implémentées sur cette branche (pipeline mouvements, mois incomplets, baselines, clip, inventaire P10/P50/P90, parcours UI). Le texte ci-dessous décrit l’état **avant** correction ; c’est le diagnostic à citer dans le mémoire.

---

## 1. Ce que le système prétend faire

L’application se présente comme un outil de **prévision des ventes (Prophet)** et d’**optimisation des stocks**. Le pied de page UI dit que les prévisions sont « générées avec Prophet à partir de l’historique de ventes ».

Dans le code, il y a en réalité **deux moteurs distincts**, qui ne se parlent presque pas :

| Surface | Ce qui est vraiment calculé | Modèle |
|---|---|---|
| Tableau de bord, statuts, autonomie, qty à commander | moyenne historique quotidienne `sum(qty) / span_days` | aucun ML |
| Simulateur | somme des `yhat` Prophet sur N mois, puis division par `N × 30` | Prophet |
| Page `/forecast` | appelle `/simulation` **sans entrepôt** | Prophet contourné (zéros) |
| `GET /metrics` | un Prophet **global** (tous entrepôts agrégés) | Prophet, autre modèle que la prod |

Le stock n’est **jamais prédit**. C’est un scalaire saisi à la main dans `settings.json`. L’« autonomie » est un simple `stock_utile / consommation_moyenne`. Ce n’est pas une trajectoire de stock.

Or les fichiers source contiennent déjà de quoi reconstruire le stock : achats (`Réception = Acheté`), ventes (`Stock en sortie = Vendu`), transferts, comptages, et un rapprochement D365 vs physique (`1225-Rapprochement D365-Dépôts 1.xlsx`) avec stock initial, ventes, trans in/out. Tout cela est jeté à l’import.

---

## 2. Pipeline actuel (ce que le code fait)

```
Excel D365
  → classify_dataset (exige 4 colonnes)
  → keep only Stock en sortie == "vendu"
  → abs(Quantité)
  → agrégat journalier (Date, Entrepôt)
  → à l’inférence : ré-agrégat mensuel (MS)
  → Prophet par entrepôt (ou global pour /metrics)
  → dashboard : ignore Prophet, reprend la moyenne journalière
  → simulation : somme yhat, borne haute comme « demande ajustée »
```

Un seul article (`Numéro de produit = 1`), unité KG, quatre entrepôts. Ce n’est pas un problème multi-SKU. C’est un problème **multi-dépôt d’un même fluide (gaz)**.

### Volumes bruts vs utilisés

| Type de mouvement | Lignes | Quantité nette (kg) | Conservé ? |
|---|---:|---:|---|
| Vendu | 26 300 | −67 600 238 | oui (valeur absolue) |
| Acheté | 13 227 | +67 682 025 | **non** |
| Transfert | 2 546 | — | **non** |
| Comptage | 36 | — | **non** |
| Rapprochement stock physique | 1 classeur, 5 feuilles | stocks SI / SFS | **non** (fichier rejeté) |

Achats ≈ ventes. L’identité de stock est observée dans les données. Le modèle ne l’utilise pas.

---

## 3. Les séries réellement modélisées

Après nettoyage, une observation = un jour × un entrepôt, puis Prophet voit **un point par mois**.

| Entrepôt | Mois | Première date | Dernière date | Jours de vente | Dernier mois |
|---|---:|---|---|---:|---|
| DP0117 | 28 | 2024-01-02 | 2026-04-09 | 722 | avril 2026, **8 jours**, 251 t vs ~1 427 t les 3 mois d’avant |
| DP0517 | 28 | 2024-01-02 | 2026-04-09 | 715 | idem, mois tronqué |
| DP1602 | 24 | 2024-05-18 | 2026-04-09 | 461 | idem |
| DP1608 | **4** | 2025-10-30 | 2026-01-05 | **18** | janvier 2026, **1 jour**, 575 kg |

Avril 2026 n’est pas un mois de demande faible. C’est une **censure** (export arrêté au 9 avril). Il est pourtant traité comme une observation mensuelle pleine, dans l’entraînement **et** dans le hold-out. Ça suffit à exploser le MAPE.

Prophet a besoin d’un minimum de **deux cycles annuels** pour identifier une saisonnalité annuelle. 28 mois, c’est limite. 4 mois, ce n’est pas un cas Prophet.

---

## 4. Comment Prophet est configuré

```python
Prophet(
    yearly_seasonality="auto",   # pas True
    weekly_seasonality=False,    # cohérent : données mensuelles
    daily_seasonality=False,     # cohérent
    changepoint_prior_scale=..., # lu dans model_hyperparameters.json
    seasonality_prior_scale=...,
)
```

Ce qui va dans le bon sens :

- un modèle **par entrepôt**, pas un modèle unique (sauf `/metrics`, qui casse cette règle) ;
- pas de saisonnalité weekly/daily sur du mensuel ;
- hyperparamètres **choisis hors ligne**, pas une grid search à chaque clic ;
- `weekly_seasonality=False` est le bon réflexe.

Ce qui ne va pas.

### 4.1 `yearly_seasonality="auto"` ne fait pas ce que le commentaire dit

Mesure réelle au fit :

| Série | n mois | `auto` active yearly ? |
|---|---:|---|
| DP0117 / DP0517, série complète (28) | 28 | **oui** |
| DP0117 hold-out train (22 mois, 80 %) | 22 | **non** (`seasonalities = {}`) |
| DP1602 (24 mois, emprise < 730 jours) | 24 | **non** |
| DP1608 | 4 | **non** |

La CV hors-ligne tourne sur la série **complète**, donc yearly est ON pour DP0117/DP0517. Le hold-out de production coupe à 80 %, yearly passe OFF. On sélectionne `seasonality_prior_scale` dans un régime, on évalue et parfois on sert dans un autre.

Pour DP1602, yearly n’est jamais activé en `auto`. `seasonality_prior_scale` (choisi à 1) **n’a aucun effet** : il n’y a pas de composante saisonnière. On a « tuné » un paramètre fantôme.

`fourier_order` par défaut = **10**. C’est calibré pour du **quotidien**. Sur 28 points mensuels, 20 termes de Fourier + tendance + ~16 changepoints, le modèle est surparamétré. Pour du mensuel, `fourier_order=3` est le standard.

### 4.2 Croissance libre → prévisions négatives

Pas de `floor`, pas de `growth='logistic'`, pas de clip. Sur DP1608, l’horizon 3 mois donne `yhat = [4755, -1912, -9293]`. Une demande négative n’a pas de sens physique. La simulation s’en sert quand même pour dimensionner une commande.

### 4.3 Trop de changepoints

Défaut Prophet : `n_changepoints=25`, `changepoint_range=0.8`. Sur 22–28 points, ça fait un saut de tendance presque tous les mois. DP0517 a été sélectionné avec `changepoint_prior_scale=0.2` (souple). En hold-out le modèle **extrapole une droite croissante** (1,20 M → 1,39 M) alors que la série n’en fait pas. Une moyenne simple le bat.

### 4.4 `prophet_model.pkl` n’est jamais chargé

Le fichier existe. `ForecastingService` ré-entraîne **deux fois** à chaque requête (hold-out + fit final). Pas de modèle versionné, pas de freeze des poids, pas de date d’entraînement.

---

## 5. La « cross-validation » : ce qui est écrit, ce qui est mesuré

Le script `backend/analysis/select_hyperparameters.py` est la partie la plus proche d’une vraie méthode. Il utilise `prophet.diagnostics.cross_validation` + `performance_metrics`, ce qui est le protocole recommandé par Facebook Prophet.

```
initial = 365 days
period  = 30 days
horizon = 90 days
grille  = changepoint_prior_scale ∈ {0.05, 0.1, 0.2}
          × seasonality_prior_scale ∈ {1, 10, 25}
critère = RMSE moyen sur les buckets d’horizon
min     = 16 mois, sinon défaut Prophet
```

### 5.1 Ce qui est correct

- CV **temporelle glissante**, pas un K-fold i.i.d. (qui fuirait le futur).
- Horizon aligné sur 3 mois, l’horizon métier par défaut.
- `initial=365 days` pour laisser un cycle avant la première cutoff.
- Sélection **hors ligne**, fichier JSON relu en prod : on ne triche pas en re-cherchant les hyperparamètres sur le test de l’app.
- DP1608 est honnêtement skippé (`cv_skipped: true`, 4 mois).

### 5.2 Ce qui casse la validité de la CV

1. **Données mensuelles, horizons en jours.** Prophet construit des cutoffs toutes les 30 jours et un horizon 90 jours. Les actuals ne tombent qu’aux 1ers du mois. `performance_metrics` agrège ensuite par horizon *journalier*, puis le script fait `.mean()` sur toutes ces lignes. On moyenne des erreurs à 1 jour, 10 jours, 90 jours qui, pour une série mensuelle, ne correspondent pas à 90 forecasts indépendants. Le RMSE publié n’est pas « RMSE à 3 mois ». C’est une moyenne de horizons mal définis.

2. **Critère = RMSE, sans garde-fou MAPE.**  
   DP1602 a gagné avec RMSE 53 623 — le plus petit des quatre, simplement parce que le dépôt est plus petit. Son MAPE CV est **98 %**. Un modèle à 98 % d’erreur relative n’aurait jamais dû être promu. Pour du dimensionnement de stock, le MAPE (ou le sMAPE / MAE pondéré) est le bon critère, pas le RMSE brut.

3. **Le mois tronqué d’avril 2026 est dans la CV.** Chaque cutoff qui « prédit » avril compare ~1,4 M kg attendus à 251 t observés. Ça gonfle artificiellement RMSE et MAPE, et ça peut faire gagner une config plus « plate » pour de mauvaises raisons.

4. **Grille trop étroite.** Pas de `seasonality_mode` (additive vs multiplicative), pas de `n_changepoints`, pas de `changepoint_range`, pas de `fourier_order`, pas de `interval_width`. Pour de la demande dont la variance scale avec le niveau, le mode **multiplicatif** est le premier levier, pas `seasonality_prior_scale` sur une saisonnalité absente.

5. **Pas de baseline dans la CV.** On choisit le moins mauvais Prophet. On ne demande jamais s’il bat une naïve saisonnière. Sur DP1602, la naïve saisonnière est deux fois meilleure (voir §6).

6. **Les métriques affichées dans l’app ne sont pas celles de la CV.**  
   En production, `_fit_and_evaluate` fait un **unique split 80/20** :

   - DP0117 / DP0517 : 22 mois train / 6 mois test (dont avril tronqué)
   - DP1602 : 19 / 5
   - DP1608 : 3 / **1 point** → MAE = RMSE, MAPE 6 595 %, « crédibilité » 0

   Si le test est vide, le code reporte l’erreur **in-sample** (le modèle a déjà vu les points). C’est de l’optimisme, pas de la validation.

   `GET /metrics` entraîne **un** Prophet sur la somme des quatre dépôts. Ce n’est le modèle de personne.

### 5.3 « Taux de crédibilité »

```python
mape = mean(|y - yhat| / y) * 100
credibility_rate = max(0, 100 - mape)
```

Ce n’est pas une crédibilité bayésienne, ni la couverture des intervalles Prophet (`yhat_lower` / `yhat_upper`, `interval_width=0.8` par défaut). C’est `100 − MAPE` renommé. Un MAPE de 53 % devient « 47 % de crédibilité ». Ça se lit comme une qualité de modèle. Ça n’en est pas une, et ça n’a aucun rapport avec l’intervalle de confiance affiché à côté.

La simulation invente encore une autre « confidence » :

```
confidence = 100 - (sum(upper) - sum(yhat)) / sum(yhat) * 100
```

Sommer des quantiles n’est pas le quantile de la somme. P(tous les mois dans le haut de l’intervalle) n’est pas 80 %. On mélange ensuite `yhat` (moyenne) pour la commande et `upper` (borne haute) pour le run-out journalier. Formules incohérentes.

---

## 6. Résultats empiriques : Prophet contre des basiques

Hold-out chronologique 80/20, **mêmes hyperparamètres que la prod**, mêmes données. C’est exactement le protocole de `_fit_and_evaluate`.

| Entrepôt | Prophet MAE | Naive | Moyenne | Naive saisonnière | MAPE Prophet | MAPE CV (fichier JSON) |
|---|---:|---:|---:|---:|---:|---:|
| DP0117 | 301 918 | 371 829 | 394 316 | 346 767 | 65 % | 53 % |
| DP0517 | 384 351 | 314 977 | **216 302** | 315 125 | 95 % | 23 % |
| DP1602 | 56 452 | 53 184 | 36 888 | **23 264** | 124 % | 98 % |
| DP1608 | 37 920 | **17 800** | 30 050 | 17 800 | 6 595 % | skip |

Lecture pour un jury de stage :

- Sur 3 dépôts sur 4, **un estimateur sans ML est meilleur**.
- L’écart CV vs hold-out sur DP0517 (23 % → 95 %) montre que la métrique de sélection **ne généralise pas**. C’est le symptôme classique d’une CV mal spécifiée + mois tronqué dans le test.
- DP0117 « gagne » de peu, et une grande partie de l’erreur vient d’avril (251 t vs ~1,1 M prédits). Sans ce point, le match Prophet vs naive saisonnière est à refaire — c’est le premier tableau que le mémoire doit contenir.
- DP1608 ne devrait **pas** passer dans Prophet. 4 points, 1 changepoint, prévisions négatives. Un lissage exponentiel, une moyenne, ou un pooling avec DP1602 (même site Lambaréné) sont les seules options honnêtes.

In-sample (ce que le code affiche quand le hold-out est trop court) : MAPE 18 % / 14 % sur DP0117 / DP0517. Ça donne l’illusion d’un modèle juste. Ce n’est pas une preuve.

---

## 7. Le stock n’est pas dans le modèle — c’est le trou du stage

Objectif déclaré : ne pas seulement prédire les sorties, **prédire le stock**.

Aujourd’hui :

```
autonomie_jours = (stock_saisi - min_saisi) / (ventes_totales / nb_jours_calendaires)
date_rupture    = aujourd'hui + autonomie_jours
qty_commande    = conso_jour × (délai + 30) + min - stock     # dashboard
                = yhat + (upper/30N)×délai + min - stock     # simulateur
```

Trois problèmes de fond.

1. **Le stock n’est pas une série.** Pas d’historique, pas de niveau observé dans le temps. On ne peut pas apprendre un modèle de stock, ni caler un inventaire. Pourtant le rapprochement D365 donne un SI, des ventes, des trans in/out, un SFS. Les mouvements `Acheté` / `Transfert` permettraient `stock_t = stock_{t-1} + achats_t + trans_in_t − ventes_t − trans_out_t`.

2. **Consommation dashboard ≠ consommation simulateur.**  
   Dashboard : moyenne sur tout l’historique, y compris les trous et le mois tronqué.  
   Simulateur : Prophet, borne haute, mois de 30 jours.  
   Un même dépôt a deux autonomies différentes. Un mémoire ne peut pas laisser ça.

3. **Pas de trajectoire.** Le run-out suppose une demande **constante** tous les jours. Dès qu’il y a une saisonnalité (gaz : saison des pluies, rentrée, fêtes), la date de rupture vraie n’est pas `stock / moyenne`. Il faut :

   ```
   stock[0] = stock_observé
   pour t = 1..H :
       stock[t] = stock[t-1] - demande_prédite[t] + réceptions_déjà_commandées[t]
       rupture  = premier t tel que stock[t] < min
       commande = policy(stock, délai, min, forecast_path)
   ```

   C’est de la **simulation d’inventaire**, pas un second Prophet sur le stock. On ne « prédit » pas le stock comme une série indépendante : on le **déduit** de la demande et de la politique. C’est plus solide scientifiquement, et c’est exactement le discours à tenir en M&M.

---

## 8. Verdict : est-ce que Prophet est « bien utilisé » ?

**L’intention est la bonne, l’implémentation n’est pas soutenable en M&M de stage.**

Ce qui est sauvable et déjà au bon niveau conceptuel :

- modèle par entrepôt ;
- CV temporelle Prophet en hors-ligne, pas de random split ;
- pas de weekly/daily sur du mensuel ;
- freeze des hyperparamètres en prod.

Ce qui ferait recaler un relecteur :

1. Le ML ne sert **pas** le dashboard, qui est l’écran principal.
2. La CV et les métriques UI sont **deux protocoles différents**.
3. `100 − MAPE` n’est pas une crédibilité.
4. Prophet **perd** contre des basiques sur la majorité des dépôts.
5. `yearly="auto"` + `seasonality_prior_scale` tuné alors que la saisonnalité est souvent absente.
6. Mois incomplet dans train, test et CV.
7. Prévisions négatives, pas de contrainte de positivité.
8. Stock, achats, transferts, rapprochement : données métier présentes, **non utilisées**.
9. `/metrics` = encore un autre modèle (global).
10. Objectif stock : non traité. Formule de run-out constante, settings mutés par la simulation.

Prophet n’est pas « le mauvais outil » pour 28 mois de gaz mensuel. C’est un outil **mal cadré** : trop de degrés de liberté, pas de baseline, pas de nettoyage du dernier mois, et un usage métier (stock) qui n’est pas branché sur la prévision.

---

## 9. M&M cible — ce qu’il faudrait écrire et implémenter

### 9.1 Question de recherche (à figer)

> À partir des mouvements D365 d’un même produit gaz sur N dépôts, (i) prévoir la demande mensuelle à 1–3 mois mieux qu’une naïve saisonnière, (ii) en déduire une trajectoire de stock et une date de réapprovisionnement, (iii) quantifier l’incertitude et la valeur métier (ruptures évitées / surstock).

Pas : « on a mis Prophet ».

### 9.2 Données

1. Conserver **tous** les types de mouvement, pas seulement `Vendu`.
2. Reconstruire `stock_t` par dépôt (identité comptable), caler sur le rapprochement physique quand il existe.
3. Marquer les **mois incomplets** (dernier mois si `max(date) < fin de mois`) et les **exclure** de l’apprentissage et de l’évaluation. Avril 2026 : 8 jours, à sortir.
4. DP1608 : trop court. Soit pooling avec DP1602 (même site), soit modèle naïf, soit hors périmètre avec justification.
5. Unité et grain : rester en kg / mois pour Prophet ; descendre au jour seulement pour la simulation d’inventaire (demande mensuelle étalée ou modèle quotidien si on a assez de jours).

### 9.3 Modèle de demande

Protocole unique, le même en sélection, en évaluation et dans l’app.

1. **Baselines obligatoires** (tableau du mémoire) : naïve, moyenne, naïve saisonnière (même mois n−1), éventuellement ETS / moyenne mobile 3 mois.
2. **Prophet** seulement s’il bat la meilleure baseline sur le critère métier :
   - `yearly_seasonality=True` si ≥ 24 mois **complets**, sinon `False` ;
   - `fourier_order=3` en mensuel ;
   - `n_changepoints` bas (3–5), `changepoint_range=0.8` ;
   - `seasonality_mode` testé additif **et** multiplicatif ;
   - `yhat = max(yhat, 0)` (et les bornes) ;
   - pas de `auto` magique.
3. **CV temporelle en mois**, pas en jours : `horizon = 3`, `period = 1`, `initial = 12` **mois**. Rapporter RMSE **et** MAPE/sMAPE **à l’horizon 1 et 3 mois**, pas la moyenne de 90 buckets journaliers.
4. Critère de sélection : MAPE (ou MAE) à 3 mois, avec **rejet** si MAPE > seuil (ex. 30 %) → on sert la baseline.
5. Les métriques UI = les métriques CV du dépôt, jamais l’in-sample, jamais un modèle global.

### 9.4 Modèle de stock (le vrai apport)

Pas un second Prophet sur le stock.

```
demande[t]     = forecast Prophet (ou baseline) du mois t, bornée ≥ 0
réceptions[t]  = commandes déjà passées dont l’arrivée est à t
stock[t]       = stock[t-1] + réceptions[t] - demande[t]
rupture        = min { t | stock[t] < stock_min }
commande       = policy : passer à t* = rupture - délai, q = target - stock_projeté
```

Incertitude : simuler K trajectoires dans l’intervalle Prophet (`yhat_lower` / `yhat_upper`, ou échantillons) et donner une **date de rupture P10 / P50 / P90**, pas une seule date + un `confidence` inventé.

Le dashboard et le simulateur doivent **partager cette fonction**. Sinon le M&M est fendu en deux.

### 9.5 Ce qu’on ne met plus dans le mémoire

- « Taux de crédibilité = 100 − MAPE »
- Split 80/20 présenté comme de la CV
- Prophet sur 4 points
- Mois incomplets comme observations
- Un `settings.json` muté par une simulation what-if

---

## 10. Plan de correction, par priorité

Ordre pensé pour un stage : d’abord rendre les chiffres honnêtes, ensuite brancher le stock, ensuite seulement « améliorer Prophet ».

| # | Chantier | Impact M&M | Effort |
|---|---|---|---|
| 1 | Exclure le dernier mois incomplet partout (train, CV, UI) | Les MAPE actuels ne veulent rien dire tant que ce n’est pas fait | petit |
| 2 | Un seul protocole d’évaluation : CV mensuelle + baselines, métriques UI = ce protocole | C’est le cœur du chapitre M&M | moyen |
| 3 | Clip `yhat ≥ 0`, yearly explicite, moins de changepoints, `fourier_order=3` | Aligne Prophet sur des séries courtes mensuelles | petit |
| 4 | Si Prophet > baseline + MAPE acceptable → on le sert, sinon baseline | Évite de déployer un modèle moins bon qu’une moyenne | petit |
| 5 | Import : ventes **et** achats **et** transferts ; reconstruire le stock | Condition pour « prédire le stock » | moyen |
| 6 | Trajectoire d’inventaire partagée dashboard / simulateur ; simulation **sans** écrire `settings.json` | Cohérence métier | moyen |
| 7 | Incertitude : P10/P50/P90 de date de rupture, plus de `100-MAPE` | Niveau mémoire | moyen |
| 8 | DP1608 : pooling ou hors périmètre | Honnêteté | petit |
| 9 | Parser le rapprochement D365 comme vérité terrain du stock | Calage, pas seulement prévision | plus lourd |

---

## 11. Annexes de reproduction

Commandes utilisées pour les tableaux §3 et §6, depuis `backend/` avec le venv du projet :

```bash
source venv/bin/activate
python analysis/select_hyperparameters.py   # déjà produit model_hyperparameters.json
```

Les hold-outs Prophet vs naïve ont été calculés avec les mêmes `changepoint_prior_scale` / `seasonality_prior_scale` que `model_hyperparameters.json`, `Prophet(yearly_seasonality="auto", weekly_seasonality=False, daily_seasonality=False)`.

Fichiers clés :

- `backend/app/forecasting.py` — fit, hold-out 80/20, métriques UI
- `backend/analysis/select_hyperparameters.py` — CV Prophet hors-ligne
- `backend/model_hyperparameters.json` — choix figés
- `backend/app/dashboard.py` — moyenne historique + simulation (mélange yhat / upper)
- `backend/app/data_store.py` — filtre `vendu` uniquement
- `backend/data/imports/` — mouvements complets + rapprochement non lus

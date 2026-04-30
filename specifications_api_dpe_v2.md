# Spécifications Techniques : API DPE ADEME (DataFair) - V2

Ce document est une mise à jour basée sur la documentation officielle du jeu de données `dpe03existant`. Il est conçu pour une IA de développement créant un logiciel de prospection immobilière et de cartographie.

## 1. Références du Jeu de Données
*   **Identifiant Dataset** : `dpe03existant`
*   **Volume** : ~14,6 millions d'enregistrements (logements existants post-juillet 2021).
*   **Fréquence** : Mise à jour hebdomadaire.
*   **Endpoint API** : `https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines`

## 2. Paramètres de Requête (Standard DataFair)

| Paramètre | Description |
| :--- | :--- |
| `qs` | Requête complexe (Syntaxe Lucene). Recommandé pour les filtres multiples. |
| `q` | Recherche plein texte simple sur tous les champs. |
| `size` | Nombre de résultats par page (Maximum : **10000**). |
| `start` | Index de début (Offset) pour la pagination. |
| `select` | Liste des champs à retourner (séparés par des virgules). |
| `sort` | Champ de tri (ex: `date_etablissement_dpe:desc`). |
| `format` | `json` (défaut), `csv`, ou `geojson`. |

## 3. Syntaxe de Filtrage (Lucene) via `qs`

Le paramètre `qs` permet des requêtes puissantes pour la prospection :

*   **Territoires** :
    *   Code Postal : `code_postal_brut:34000`
    *   Code INSEE : `code_insee_commune_actualise:34172` (Plus précis pour les villes multi-CP).
    *   Plusieurs zones : `code_postal_brut:(34000 OR 34070)`
*   **Dates** :
    *   Plage fixe : `date_etablissement_dpe:[2024-01-01 TO 2024-12-31]`
    *   Depuis une date : `date_etablissement_dpe:[2024-01-01 TO *]`
*   **Critères Métier (Prospection)** :
    *   Passoires thermiques : `etiquette_dpe:(F OR G)`
    *   Type de bien : `type_batiment:"Maison"` ou `type_batiment:"Appartement"`
    *   Exclusion : `NOT etiquette_dpe:A`
*   **Combinaison** :
    `qs=code_postal_brut:34000 AND etiquette_dpe:(F OR G) AND type_batiment:"Maison"`

## 4. Algorithme de Récupération Exhaustive

Pour extraire 100% des données d'une zone :
1.  Lancer un premier appel avec `size=10000` et `start=0`.
2.  Récupérer la valeur `total` dans l'objet de réponse JSON.
3.  Calculer le nombre d'itérations : `Math.ceil(total / 10000)`.
4.  Boucler en incrémentant `start` de 10000 à chaque étape.
5.  **Attention** : Si `total` > 10000, le tri (`sort`) est obligatoire pour garantir la cohérence des pages.

## 5. Exploitation Cartographique et Géocodage

Les données ADEME sont des saisies brutes. Le géocodage est souvent incomplet.

### Champs GPS natifs
Utiliser `latitude` et `longitude` s'ils sont présents.
*Note : De nombreux records ont des coordonnées à null ou positionnées en centre-ville par défaut.*

### Stratégie de Complétion (Logiciel)
Si `latitude` ou `longitude` est manquant/invalide :
1.  **Source** : API Base Adresse Nationale (BAN).
2.  **Appel** : `https://api-adresse.data.gouv.fr/search/?q={adresse_brut}&postcode={code_postal_brut}&limit=1`
3.  **Stockage** : Il est conseillé de mettre en cache les résultats de géocodage pour limiter les appels BAN.

## 6. Champs Clés pour la Prospection (à mettre dans `select`)
*   `identifiant_dpe` : Clé unique (Pivot).
*   `adresse_brut`, `code_postal_brut`, `nom_commune_brut` : Localisation.
*   `etiquette_dpe`, `etiquette_ges` : Performance.
*   `annee_construction` : Ciblage rénovation.
*   `surface_habitable_logement` : Surface.
*   `type_batiment` : Typologie.
*   `date_etablissement_dpe` : Date de validité.

## 7. Précautions d'Usage
*   **Quota** : Sans clé API, la limite est de 60 req/min. Avec clé (`x-apikey`), elle est nettement plus élevée.
*   **Représentativité** : La base ne contient que les biens ayant fait l'objet d'une transaction ou location récente. Ce n'est pas un inventaire complet du parc immobilier national.

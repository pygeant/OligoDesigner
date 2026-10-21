# OligoDesigner Pro

Conception, calcul et contrôle d'oligonucléotides modifiés : éditeur visuel en
collier de perles, assemblage de duplex, assignement LC-MS, score de risque de
synthèse et design en langage naturel.

## Fonctionnalités

- **Designer** — éditeur position par position (sucre, base, liaison,
  extrémités), notation synthétiseur dans les deux sens, patterns réutilisables.
- **Duplex** — génération du brin antisens (complément inverse, overhangs UU ou
  dTdT, miroir des modifications), appariement sens/antisens avec détection des
  wobbles, mésappariements et overhangs, export PNG et rapport HTML du duplex.
- **LC-MS** — table des espèces attendues d'un crude (n−1 positionnelles, n+1,
  n−2, P=O pour P=S, adduits acrylonitrile et Na/K, DMT-on, dépurination),
  échelle de charges en ESI négatif, assignement des masses déconvoluées avec
  tolérance en Da ou en ppm, export Excel et HTML.
- **Risque de synthèse** — score pondéré et auditable : runs de G,
  G-quadruplexes, densité purique, tiges-boucles, longueur.
- **IA** — design en langage naturel (« gapmer 5-10-5, LNA sur les ailes, PS
  intégral ») et relecture critique du motif.
- **Batch** — application d'un pattern à une liste de séquences, exports Excel,
  `.seq`, PNG et rapport HTML.

Le modèle de calcul, ses conventions et ses limites connues sont documentés dans
[docs/CHEMISTRY.md](docs/CHEMISTRY.md).

## Exécution locale

Prérequis : Node.js.

```bash
npm install
npm run dev     # http://localhost:3000
```

Variables d'environnement (`.env.local`, voir `.env.example`) :

| Variable | Rôle |
| --- | --- |
| `GEMINI_API_KEY` | Active le proxy IA côté serveur. La clé reste sur le serveur. |
| `APP_PASSWORD` | Protège l'application par mot de passe une fois publiée. |

## Build

```bash
npm run build   # dist/index.html — application autonome en un seul fichier
npm run lint    # tsc --noEmit
npm test        # vitest
```

Le fichier `dist/index.html` est une application complète et hors ligne (PWA).
La clé API n'y est **pas** incorporée : en mode autonome, l'IA n'est active que
si l'utilisateur renseigne sa propre clé dans l'onglet Database.

## Organisation du code

```
src/
  lib/            logique métier pure, sans React ni DOM
    chemistry.ts  constantes, bibliothèque de modifications, patterns
    calc.ts       masses, ε₂₆₀, composition, notation
    parser.ts     analyse de la notation synthétiseur
    duplex.ts     complément inverse et appariement
    ms.ts         espèces attendues et assignement LC-MS
    risk.ts       score de risque de synthèse
    render.ts     rendu canvas (collier et duplex)
    report.ts     rapports HTML autonomes
    ai.ts         couche IA (proxy serveur ou clé locale)
  components/     composants d'interface par onglet
  App.tsx         composition et état de l'application
server.ts         serveur de développement, porte d'entrée et proxy IA
```

Les modules de `src/lib` sont purs et couverts par les tests de
`src/lib/__tests__`.

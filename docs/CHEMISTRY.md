# Modèle de calcul

Ce document décrit ce que l'application calcule, avec quelles conventions et
quelles limites connues. Toutes les masses sont des **masses moyennes** en
g/mol, cohérentes avec une déconvolution ESI sur simple quadripôle.

## Masse moléculaire

`src/lib/calc.ts` — `calculateStats`

```
MW = Σ résidus + Σ modifications + Σ deltas de squelette
   + (n_bases − 1) × 61.964          pont phosphodiester (+HPO₃ − H₂O)
   + 79.979 si phosphate 5' actif
   + 303.03 si DMT-on
```

- Les résidus standards portent la masse du **nucléoside libre** ; le pont est
  ajouté séparément, une fois par liaison.
- `PS` = +16.06 par liaison (S − O en masse moyenne).
- Les espaceurs non nucléosidiques (HEG) contribuent à la masse mais ni à la
  longueur ni au %GC.

## Coefficient d'extinction ε₂₆₀

```
ε = round(0.9 × Σ ε_monomères)
```

**Limite assumée.** Le facteur d'hypochromicité forfaitaire de 0,9 est
indépendant de la séquence. L'écart réel face à la méthode des doublets
(Cantor–Warshaw) va d'environ 3 % sur une séquence riche en pyrimidines à
environ 15 % sur un empilement purine-purine, et se répercute directement sur
toute quantification par A₂₆₀. Deux points annexes non traités :

- les valeurs monomériques `dA = 15200` et `dG = 12010` diffèrent des valeurs
  usuelles (15400 et 11500) ;
- les chromophores terminaux (Cy3 et apparentés) ne portent pas d'ε et ne sont
  donc pas comptés dans l'A₂₆₀, ni corrigés.

Le modèle est conservé tel quel par choix ; le passage aux doublets se fait
dans cette seule fonction.

## Tm

Supprimé. Les formules Wallace et GC% précédemment utilisées ignoraient le
sel, le magnésium, la concentration de brin et surtout les modifications
2'-OMe / 2'-F / LNA : un 21mer ESC et son homologue non modifié rendaient la
même valeur. Un modèle plus proches des besoins (NN SantaLucia / Xia, correction
Owczarzy, incréments ΔΔG par modification) reste à implémenter.

## Duplex

`src/lib/duplex.ts`

Convention : le brin sens est posé 5'→3' de gauche à droite, l'antisens 3'→5'
en dessous. Le registre retenu maximise le score d'appariement
(Watson-Crick = +2, wobble G·U = +1, mésappariement = −1), à égalité le
recouvrement le plus large l'emporte. Aucune thermodynamique n'est calculée :
le module décrit la structure (paires, wobbles, mésappariements, overhangs),
pas sa stabilité.

`buildAntisense` produit le complément inverse en recopiant, pour chaque
position, la série et la modification du résidu qu'elle apparie, puis ajoute
l'overhang demandé (UU ou dTdT).

## Espèces LC-MS

`src/lib/ms.ts` — construites à partir de la masse pleine longueur :

| Espèce | Δ masse |
| --- | --- |
| n−1 (par position) | −(résidu + pont correspondant) |
| n+1 (double couplage) | +(résidu + pont) |
| n−2 (optionnel) | somme de deux deltas n−1 |
| P=O pour P=S, k = 1…3 | −16.06 × k |
| Adduit acrylonitrile, k = 1…2 | +53.063 × k |
| DMT-on | +303.03 |
| Dépurination A / G | −135.13 / −151.13 |
| Perte d'eau | −18.015 |
| Phosphate 5' | ±79.979 |
| Na⁺ / K⁺, k = 1…2 | +21.982 × k / +37.956 × k |

Les n−1 de même masse sont regroupés et la liste des positions compatibles est
conservée : c'est ce qui permet de remonter au couplage fautif.

L'échelle de charges est donnée en mode négatif : `m/z = (M − z × 1.00728) / z`.

L'assignement retient, pour chaque masse observée, l'espèce la plus proche dans
la fenêtre de tolérance (Da ou ppm) et liste jusqu'à trois alternatives.

## Score de risque de synthèse

`src/lib/risk.ts` — heuristique pondérée, volontairement auditable :

| Constat | Poids |
| --- | --- |
| G-quadruplexe putatif | 30 |
| Run de ≥ 5 G | 25 |
| Run de 4 G | 20 |
| Tige-boucle de score ≥ 12 | 20 |
| Longueur > 40 nt | 20 |
| Longueur > 30 nt | 12 |
| Densité purique globale > 70 % | 12 |
| Tige-boucle de score 8–11 | 10 |
| Fenêtre de 9 purines sur 10 | 10 |
| Run de 3 G | 8 |
| Longueur > 25 nt | 6 |
| Homopolymère non-G de ≥ 5 | 6 |
| Squelette PS intégral | 0 (informatif) |

Score plafonné à 100. Bandes : < 20 faible, 20–44 modéré, 45–69 élevé, ≥ 70
critique. La tige-boucle est un **proxy de force de tige** (G:C = 3, A:U = 2,
G:U = 1 sur la plus longue tige contiguë avec boucle ≥ 3 nt), pas une énergie
libre de repliement.

Les poids sont des constantes dans un seul fichier : ils sont faits pour être
recalibrés sur les rendements internes.

## IA

`src/lib/ai.ts` — deux transports résolus à l'exécution :

- **proxy** : l'application est servie par `server.ts`, qui détient la clé. Rien
  de secret n'atteint le navigateur. La clé n'est plus injectée dans le bundle.
- **direct** : build HTML autonome, clé fournie par l'utilisateur et conservée
  dans son navigateur. Les séquences analysées sont alors envoyées au
  fournisseur ; l'interface l'indique explicitement.

La sortie du modèle n'est jamais appliquée telle quelle : `applyDesignSpec`
valide la longueur du motif, ignore les modifications absentes de la
bibliothèque locale, complète les liaisons manquantes en PO et remonte chaque
ajustement à l'utilisateur.

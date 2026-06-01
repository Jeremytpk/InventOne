# Spécifications de Sécurité d'InventOne

## 1. Invariants de Données
- Le rôle d'un utilisateur ne peut pas être modifié par lui-même s'il n'est pas déjà un administrateur.
- L'administrateur par défaut est auto-approuvé sur la base de son email `jeremytopaka@gmail.com`.
- Les modifications de quantité d'articles doivent toujours respecter les types d'entiers.
- Les clients ne peuvent modifier **que** les clés `currentStock` et `lastUpdated` sur leurs fiches de stock pour signaler leur inventaire restant, empêchant la modification de la quantité assignée ou du propriétaire.
- Les logs d'audit sont immuables (aucune mise à jour ou suppression autorisée).

## 2. Le Test des "12 Payloads Malveillants" (Dirty Dozen)
1. **Élévation de Privilège Client** : Un utilisateur standard tente de se créer directement avec le rôle `admin`.
2. **Auto-Approbation Forcée** : Un utilisateur standard tente de définir son propre profil à `approved: true`.
3. **Usurpation d'Identité de Création** : `userA` tente de créer un document utilisateur pour `userB`.
4. **Validation de Stock Poisoning** : Injection d'une chaîne de caractères de 1 Mo comme ID de document d'inventaire.
5. **Modification Interclic Client** : Le client tente d'augmenter son stock livré (`assignedQuantity`).
6. **Modification Immortelle** : Tentative de modification du champ `createdAt` sur la fiche utilisateur après sa création.
7. **Sabotage d'Audit** : Modification des logs d'audit existants pour effacer une soustraction frauduleuse.
8. **Lecture PII Transversale** : Le Client A tente de faire un `get` sur la fiche de stock ou l'adresse du Client B.
9. **Vol de Métadonnées d'Inventaire** : Utilisateur non connecté tentant de lire la liste complète des stocks.
10. **Empoisonnement de Types** : Envoi de `quantity: "beaucoup"` au lieu d'un type entier.
11. **Bypass Horodateur Serveur** : Envoi d'un timestamp daté dans le passé pour `updatedAt` plutôt que d'utiliser la valeur serveur `request.time`.
12. **Suppression de Master Stock** : Utilisateur non-admin tentant de supprimer un article d'inventaire clé (ex: Bidon de pétrole/huile).

## 3. Matrice de Validation de Menaces
- **Identity Spoofing** : Bloqué par validations d'ID `request.auth.uid == userId`.
- **State Shortcutting** : Bloqué par l'obligation de passer par le statut `approved: false` par défaut pour tous les nouveaux comptes (excepté l'admin prédéfini).
- **Resource Poisoning** : Bloqué par des types stricts `is int` et des tailles maximales de chaînes `.size() <= 200` sur toutes les valeurs éditables.

-- S7.5-T06 (ADR-0053) : recherche tolérante aux fautes de frappe.
-- pg_trgm compare les mots par groupes de 3 lettres (« ipohne » ressemble à « iphone ») ; extension « de confiance »
-- depuis PostgreSQL 13 : le propriétaire de la base peut l'installer sans être superutilisateur (Render compris).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index trigrammes sur le texte de recherche des fiches : la recherche approchée (opérateur <%) ne parcourt pas toute
-- la table.
CREATE INDEX "listings_search_text_trgm_idx" ON "catalog"."listings" USING GIN ("search_text" gin_trgm_ops);

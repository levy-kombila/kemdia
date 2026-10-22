-- S7.5-T05 (ADR-0052) : écran Factures de la Finance — liste du plus récent au plus ancien, recherche par commande.
CREATE INDEX "invoices_issued_at_id_idx" ON "payments"."invoices" ("issued_at" DESC, "id" DESC);
CREATE INDEX "invoices_order_reference_idx" ON "payments"."invoices" ("order_reference");

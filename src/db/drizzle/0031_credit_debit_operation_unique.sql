CREATE UNIQUE INDEX "credit_ledger_debit_operation_unique" ON "credit_ledger" USING btree ("photographer_id","type","operation_type","operation_id");

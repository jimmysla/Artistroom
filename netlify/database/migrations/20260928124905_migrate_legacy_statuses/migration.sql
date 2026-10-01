-- Map the old workflow statuses onto the new payment workflow.
-- "eingegangen" and "bestaetigt" had no payment decision yet, so both become "ausstehend".
UPDATE "registrations" SET "status" = 'ausstehend' WHERE "status" IN ('eingegangen', 'bestaetigt');

-- Least-privilege runtime access for the Approval Request reference table.
-- Disposable test and development databases apply every file in this folder
-- to the restricted runtime role after migrations.
GRANT SELECT, INSERT ON approval_requests TO orion_runtime;
GRANT UPDATE (title, description, status, version, rejection_reason, updated_at) ON approval_requests TO orion_runtime;

create index if not exists security_audit_log_ip_hash_created_idx
  on public.security_audit_log (ip_hash, created_at desc)
  where ip_hash is not null;

const secrets = Object.entries(process.env).filter(([k,v]) => v && /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k)).map(([,v]) => v!).filter(v => v.length >= 4).sort((a,b)=> b.length-a.length);
export function safeText(value: string): string {
  let s = value;
  for (const secret of secrets) s = s.split(secret).join('[REDACTED]');
  return s.replace(/\b(?:sk-(?:or-|ant-)?[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b/g, '[REDACTED]').replace(/(Bearer\s+)[^\s"']+/gi, '$1[REDACTED]');
}
export function redact(value: unknown): unknown {
  if (typeof value === 'string') return safeText(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/^(authorization|api.?key|token|secret|password)$/i.test(k)?'[REDACTED]':redact(v)]));
  return value;
}

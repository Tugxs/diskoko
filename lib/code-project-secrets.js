import crypto from 'node:crypto';
function encryptionKey(){if(!process.env.ENCRYPTION_KEY)throw new Error('Project secret encryption is not configured.');return crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();}
export function sealProjectSecret(value){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey(),iv);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,encrypted,cipher.getAuthTag()].map(v=>v.toString('base64url')).join('.');
}
export function openProjectSecret(value){
  const [iv,encrypted,tag]=value.split('.').map(v=>Buffer.from(v,'base64url'));const cipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey(),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(encrypted),cipher.final()]).toString('utf8');
}

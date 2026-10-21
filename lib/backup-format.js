import {randomBytes,scrypt,createCipheriv,createDecipheriv} from 'node:crypto';
import {promisify} from 'node:util';
import {Transform} from 'node:stream';

const derive=promisify(scrypt);
export const BACKUP_MAGIC=Buffer.from('DKBACK01');
export const BACKUP_LIMIT=128*1024*1024;
export function validateBackupPassword(value){
  if(typeof value!=='string' || value.length<16 || Buffer.byteLength(value)>256)throw Object.assign(Error('اختر كلمة مرور للنسخة من 16 إلى 256 حرفًا/بايت واحفظها خارج الموقع.'),{status:400});
  return value;
}
export function byteLimit(max){let bytes=0;return new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;done(bytes>max?Error('Backup size limit exceeded'):null,chunk);}});}
export async function encryption(password){
  validateBackupPassword(password);
  const salt=randomBytes(16),iv=randomBytes(12),header=Buffer.concat([BACKUP_MAGIC,salt,iv]);
  const key=await derive(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  const cipher=createCipheriv('aes-256-gcm',key,iv);key.fill(0);cipher.setAAD(header);
  return {header,cipher};
}
export async function decryption(password,header,tag){
  validateBackupPassword(password);
  if(header.length!==36 || !header.subarray(0,8).equals(BACKUP_MAGIC) || tag.length!==16)throw Error('Invalid encrypted backup');
  const key=await derive(password,header.subarray(8,24),32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(24,36));key.fill(0);decipher.setAAD(header);decipher.setAuthTag(tag);return decipher;
}

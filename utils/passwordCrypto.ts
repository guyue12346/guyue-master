/**
 * 密码加密/解密工具
 * 使用 AES-GCM 对称加密算法，基于 Web Crypto API
 * 密钥由设备唯一标识 + 固定盐值派生
 */

const SALT = 'guyue-master-pw-salt-2025';
const IV_LENGTH = 12;

// 从密码短语派生 AES 密钥
async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(SALT),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// 获取加密密钥的种子（使用固定种子 + 用户名 + 主机名，确保同一台机器一致）
async function getEncryptionSeed(): Promise<string> {
  try {
    if (window.electronAPI?.getUserInfo) {
      const info = await window.electronAPI.getUserInfo();
      return `guyue-pw-${info.username}-${info.hostname}`;
    }
  } catch {
    // fallback
  }
  return 'guyue-pw-default-local-key';
}

/**
 * 加密字符串
 */
export async function encryptText(plainText: string): Promise<string> {
  const seed = await getEncryptionSeed();
  const key = await deriveKey(seed);
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plainText)
  );

  // 将 iv + 密文拼接后转 base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * 解密字符串
 */
export async function decryptText(cipherText: string): Promise<string> {
  const seed = await getEncryptionSeed();
  const key = await deriveKey(seed);

  const combined = Uint8Array.from(atob(cipherText), c => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const data = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * 加密整个密码记录的敏感字段（账户、密码、网址、备注）
 */
export async function encryptPasswordRecord(record: {
  url: string;
  account: string;
  password: string;
  note: string;
}): Promise<{
  url: string;
  account: string;
  password: string;
  note: string;
}> {
  const [url, account, password, note] = await Promise.all([
    encryptText(record.url),
    encryptText(record.account),
    encryptText(record.password),
    encryptText(record.note),
  ]);
  return { url, account, password, note };
}

/**
 * 解密整个密码记录的敏感字段
 */
export async function decryptPasswordRecord(record: {
  url: string;
  account: string;
  password: string;
  note: string;
}): Promise<{
  url: string;
  account: string;
  password: string;
  note: string;
}> {
  const [url, account, password, note] = await Promise.all([
    decryptText(record.url),
    decryptText(record.account),
    decryptText(record.password),
    decryptText(record.note),
  ]);
  return { url, account, password, note };
}

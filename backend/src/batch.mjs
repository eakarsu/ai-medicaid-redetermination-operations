// X12 batch construction and transport over authenticated, host-key-pinned SFTP.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import SftpClient from 'ssh2-sftp-client';

function settings() {
  const host = process.env.SFTP_HOST?.trim();
  const port = Number(process.env.SFTP_PORT || 22);
  const username = process.env.SFTP_USER?.trim();
  const privateKeyFile = process.env.SFTP_PRIVATE_KEY_FILE?.trim();
  const hostKeyFile = process.env.SFTP_HOST_KEY_FILE?.trim();
  if (!host || !username || !privateKeyFile || !hostKeyFile) {
    const error = new Error('SFTP is not configured. Set SFTP_HOST, SFTP_USER, SFTP_PRIVATE_KEY_FILE, and SFTP_HOST_KEY_FILE.');
    error.status = 503;
    throw error;
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SFTP_PORT');
  const publicKey = fs.readFileSync(hostKeyFile, 'utf8').trim().split(/\s+/);
  if (publicKey.length < 2 || !publicKey[0].startsWith('ssh-')) throw new Error('SFTP_HOST_KEY_FILE must contain an OpenSSH public host key');
  return {
    host, port, username, privateKey: fs.readFileSync(privateKeyFile, 'utf8'),
    expectedHostKey: Buffer.from(publicKey[1], 'base64'),
    outboundPath: process.env.SFTP_OUTBOUND_PATH || '/outbound',
    inboundPath: process.env.SFTP_INBOUND_PATH || '/inbound',
  };
}

async function withSftp(operation) {
  const config = settings();
  const client = new SftpClient('renewalcare-batch');
  try {
    await client.connect({
      host: config.host, port: config.port, username: config.username,
      privateKey: config.privateKey, readyTimeout: 10000,
      hostVerifier: key => key.length === config.expectedHostKey.length && crypto.timingSafeEqual(key, config.expectedHostKey),
    });
    return await operation(client, config);
  } finally {
    await client.end().catch(() => {});
  }
}

export function buildBatch({ batchType, transactions }) {
  const batchId = `BATCH-${batchType}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const files = transactions.map((transaction, index) => ({
    sequence: index + 1, transactionSet: transaction.transactionSet,
    controlNumber: transaction.controlNumber, memberReference: transaction.memberReference,
    bytes: Buffer.byteLength(transaction.raw),
  }));
  const payload = transactions.map(transaction => transaction.raw).join('\n');
  const manifest = { batchId, batchType, createdAt: new Date().toISOString(), transactionCount: transactions.length, totalBytes: Buffer.byteLength(payload), files };
  return { manifest, payload };
}

export function batchChannel() {
  return {
    protocol: 'SFTP', configured: Boolean(process.env.SFTP_HOST && process.env.SFTP_USER && process.env.SFTP_PRIVATE_KEY_FILE && process.env.SFTP_HOST_KEY_FILE),
    host: process.env.SFTP_HOST || null, port: Number(process.env.SFTP_PORT || 22),
    outboundPath: process.env.SFTP_OUTBOUND_PATH || '/outbound', inboundPath: process.env.SFTP_INBOUND_PATH || '/inbound',
    formats: ['834 enrollment batches', '999 acknowledgments'],
  };
}

export async function uploadBatch(batch) {
  return withSftp(async (client, config) => {
    const remotePath = path.posix.join(config.outboundPath, `${batch.manifest.batchId}.edi`);
    const temporaryPath = `${remotePath}.part`;
    const contents = Buffer.from(batch.payload, 'utf8');
    try {
      await client.put(contents, temporaryPath);
      await client.rename(temporaryPath, remotePath);
    } catch (error) {
      await client.delete(temporaryPath).catch(() => {});
      throw error;
    }
    const remote = await client.stat(remotePath);
    if (remote.size !== contents.length) throw new Error(`SFTP upload size mismatch for ${remotePath}`);
    return { remotePath, bytes: remote.size, sha256: crypto.createHash('sha256').update(contents).digest('hex') };
  });
}

export async function fetchAcknowledgments(batchId) {
  return withSftp(async (client, config) => {
    const entries = await client.list(config.inboundPath);
    const names = entries.filter(entry => entry.type === '-' && entry.name.startsWith(`${batchId}-`) && entry.name.endsWith('.999')).map(entry => entry.name).sort();
    const responses = [];
    for (const name of names) {
      const remotePath = path.posix.join(config.inboundPath, name);
      const raw = await client.get(remotePath);
      responses.push({ remotePath, raw: Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw) });
    }
    return responses;
  });
}

import { MongoClient } from 'mongodb';
import { requiredEnv } from './env.js';
import logger from './logger.js';

/**
 * Connects to MongoDB and returns the handles the repos are built from.
 * Fails loud without MONGODB_URI.
 */
export async function connectDb() {
  const uri = requiredEnv('MONGODB_URI');
  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db();

  await Promise.all([
    db.collection('tenants').createIndex({ 'keys.hash': 1 }),
    db.collection('documents').createIndex({ tenantId: 1 }),
    db.collection('chats').createIndex({ tenantId: 1, updatedAt: -1 })
  ]);

  logger.info('Connected to MongoDB');
  return { client, db };
}

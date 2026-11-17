import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import mongoose from 'mongoose';
import { Collection } from '../../src/models/Collection.js';
import { Paper } from '../../src/models/Paper.js';

const TEST_DB_PATH = '/tmp/rf-collection-model-test-db';
const TEST_PORT = 27027;
const FALLBACK_URI = `mongodb://127.0.0.1:${TEST_PORT}/rf_collection_model_test`;
const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rf_collection_model_test';

let mongodProcess = null;
let activeUri = DEFAULT_URI;

async function setupDatabaseConnection() {
  try {
    await mongoose.connect(DEFAULT_URI, { serverSelectionTimeoutMS: 1000 });
    activeUri = DEFAULT_URI;
  } catch {
    try {
      rmSync(TEST_DB_PATH, { recursive: true, force: true });
    } catch {}
    mkdirSync(TEST_DB_PATH, { recursive: true });

    mongodProcess = spawn('/usr/bin/mongod', [
      '--dbpath', TEST_DB_PATH,
      '--port', String(TEST_PORT),
      '--bind_ip', '127.0.0.1',
      '--nounixsocket',
    ]);

    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        await mongoose.connect(FALLBACK_URI, { serverSelectionTimeoutMS: 500 });
        connected = true;
        activeUri = FALLBACK_URI;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (!connected) {
      throw new Error('Unable to establish MongoDB connection for Collection model test suite.');
    }
  }
}

async function teardownDatabaseConnection() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  } catch {}

  if (mongodProcess) {
    mongodProcess.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    rmSync(TEST_DB_PATH, { recursive: true, force: true });
  } catch {}
}

describe('Collection Model Test Suite', () => {
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();

  before(async () => {
    await setupDatabaseConnection();
    await Collection.syncIndexes();
  });

  after(async () => {
    await teardownDatabaseConnection();
  });

  beforeEach(async () => {
    await Collection.deleteMany({});
  });

  describe('Index Synchronization & Definitions', () => {
    it('creates unique compound index on { owner: 1, name: 1 } and sorting index', async () => {
      const indexes = await Collection.collection.indexes();

      const uniqueNameIdx = indexes.find((idx) => idx.name === 'unique_owner_collection_name');
      assert.ok(uniqueNameIdx, 'unique_owner_collection_name index should exist');
      assert.strictEqual(uniqueNameIdx.unique, true);
      assert.deepStrictEqual(uniqueNameIdx.key, { owner: 1, name: 1 });

      const sortIdx = indexes.find((idx) => idx.name === 'owner_created_at_idx');
      assert.ok(sortIdx, 'owner_created_at_idx should exist');
      assert.deepStrictEqual(sortIdx.key, { owner: 1, createdAt: -1 });
    });
  });

  describe('Document Creation & Schema Defaults', () => {
    it('creates a valid collection with required name and owner', async () => {
      const col = await Collection.create({
        name: 'Quantum Optics',
        description: 'Key research papers in optical computing',
        owner: userA,
      });

      assert.ok(col._id);
      assert.strictEqual(col.name, 'Quantum Optics');
      assert.strictEqual(col.description, 'Key research papers in optical computing');
      assert.strictEqual(col.owner.toString(), userA.toString());
      assert.deepStrictEqual(col.papers, []);
      assert.ok(col.createdAt instanceof Date);
      assert.ok(col.updatedAt instanceof Date);
    });

    it('defaults description to empty string and papers to empty array', async () => {
      const col = await Collection.create({
        name: 'Graph Theory',
        owner: userA,
      });

      assert.strictEqual(col.description, '');
      assert.deepStrictEqual(col.papers, []);
    });

    it('transforms _id to id and deletes _id and __v during JSON serialization', async () => {
      const col = await Collection.create({
        name: 'Machine Learning',
        owner: userA,
      });

      const json = col.toJSON();
      assert.strictEqual(json.id, col._id.toString());
      assert.strictEqual(json._id, undefined);
      assert.strictEqual(json.__v, undefined);
      assert.strictEqual(json.name, 'Machine Learning');
    });

    it('rejects document missing required name', async () => {
      await assert.rejects(
        async () => {
          await Collection.create({ owner: userA });
        },
        /Collection name is required/
      );
    });

    it('rejects document missing required owner', async () => {
      await assert.rejects(
        async () => {
          await Collection.create({ name: 'Neural Networks' });
        },
        /Collection owner is required/
      );
    });
  });

  describe('Name Validation & Trimming', () => {
    it('trims leading and trailing whitespace from collection name', async () => {
      const col = await Collection.create({
        name: '   Distributed Systems   ',
        owner: userA,
      });

      assert.strictEqual(col.name, 'Distributed Systems');
    });

    it('rejects empty or whitespace-only name', async () => {
      await assert.rejects(
        async () => {
          await Collection.create({
            name: '   ',
            owner: userA,
          });
        },
        /Collection name (is required|cannot be empty)/
      );
    });

    it('rejects name exceeding 100 characters', async () => {
      const longName = 'A'.repeat(101);
      await assert.rejects(
        async () => {
          await Collection.create({
            name: longName,
            owner: userA,
          });
        },
        /Collection name cannot exceed 100 characters/
      );
    });
  });

  describe('Paper References & Duplicate Prevention', () => {
    it('allows valid array of Paper ObjectIds', async () => {
      const paper1 = new mongoose.Types.ObjectId();
      const paper2 = new mongoose.Types.ObjectId();

      const col = await Collection.create({
        name: 'Selected Papers',
        owner: userA,
        papers: [paper1, paper2],
      });

      assert.strictEqual(col.papers.length, 2);
      assert.strictEqual(col.papers[0].toString(), paper1.toString());
      assert.strictEqual(col.papers[1].toString(), paper2.toString());
    });

    it('rejects duplicate paper ObjectIds in the papers array via schema validator', async () => {
      const paper1 = new mongoose.Types.ObjectId();

      await assert.rejects(
        async () => {
          await Collection.create({
            name: 'Duplicated Papers',
            owner: userA,
            papers: [paper1, paper1],
          });
        },
        /Collection cannot contain duplicate paper references/
      );
    });
  });

  describe('Duplicate Collection Name Handling & Multi-User Independence', () => {
    it('rejects duplicate collection name for the same user via unique compound index', async () => {
      await Collection.create({
        name: 'Robotics',
        owner: userA,
      });

      await assert.rejects(
        async () => {
          await Collection.create({
            name: 'Robotics',
            owner: userA,
          });
        },
        (err) => err.code === 11000
      );
    });

    it('allows the same collection name to be saved independently by different users', async () => {
      const colA = await Collection.create({
        name: 'Robotics',
        owner: userA,
      });

      const colB = await Collection.create({
        name: 'Robotics',
        owner: userB,
      });

      assert.ok(colA._id);
      assert.ok(colB._id);
      assert.strictEqual(colA.name, colB.name);
      assert.notStrictEqual(colA.owner.toString(), colB.owner.toString());
    });
  });

  describe('Owner Immutability', () => {
    it('prevents modifying owner on an existing collection document', async () => {
      const col = await Collection.create({
        name: 'Immutable Test',
        owner: userA,
      });

      col.owner = userB;
      await col.save();

      // Reload from database to verify immutability
      const reloaded = await Collection.findById(col._id);
      assert.strictEqual(reloaded.owner.toString(), userA.toString());
    });
  });
});

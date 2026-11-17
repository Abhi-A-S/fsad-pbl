import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import mongoose from 'mongoose';
import { Paper } from '../../src/models/Paper.js';

const TEST_DB_PATH = '/tmp/rf-paper-test-suite-db';
const TEST_PORT = 27018;
const FALLBACK_URI = `mongodb://127.0.0.1:${TEST_PORT}/rf_paper_model_test`;
const DEFAULT_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rf_paper_model_test';

let mongodProcess = null;
let activeUri = DEFAULT_URI;

/**
 * Attempts to connect to default MongoDB, falling back to an isolated mongod process.
 */
async function setupDatabaseConnection() {
  try {
    await mongoose.connect(DEFAULT_URI, { serverSelectionTimeoutMS: 1000 });
    activeUri = DEFAULT_URI;
  } catch {
    // Spawn isolated mongod on fallback port
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
      throw new Error('Unable to establish MongoDB connection for test suite.');
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

describe('Paper Model Test Suite', () => {
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();

  before(async () => {
    await setupDatabaseConnection();
    await Paper.syncIndexes();
  });

  after(async () => {
    await teardownDatabaseConnection();
  });

  beforeEach(async () => {
    await Paper.deleteMany({});
  });

  describe('Index Synchronization & Definitions', () => {
    it('creates all required indexes without redundant standalone owner index', async () => {
      const indexes = await Paper.collection.indexes();
      const indexNames = indexes.map((idx) => idx.name);

      // Verify partial unique compound index
      const uniqueDoiIdx = indexes.find((idx) => idx.name === 'unique_owner_doi_partial');
      assert.ok(uniqueDoiIdx, 'unique_owner_doi_partial index should exist');
      assert.strictEqual(uniqueDoiIdx.unique, true);
      assert.strictEqual(uniqueDoiIdx.partialFilterExpression?.doi?.$type, 'string');
      assert.deepStrictEqual(uniqueDoiIdx.key, { owner: 1, doi: 1 });

      // Verify chronological sorting index
      const createdIdx = indexes.find((idx) => idx.name === 'owner_created_at_idx');
      assert.ok(createdIdx, 'owner_created_at_idx should exist');
      assert.deepStrictEqual(createdIdx.key, { owner: 1, createdAt: -1 });

      // Verify weighted text search index with leading owner
      const textIdx = indexes.find((idx) => idx.name === 'owner_paper_text_search_idx');
      assert.ok(textIdx, 'owner_paper_text_search_idx should exist');
      assert.strictEqual(textIdx.key.owner, 1);
      assert.strictEqual(textIdx.weights.title, 10);
      assert.strictEqual(textIdx.weights.tags, 5);
      assert.strictEqual(textIdx.weights.authors, 3);
      assert.strictEqual(textIdx.weights.venue, 1);

      // Verify tags multikey index
      const tagsIdx = indexes.find((idx) => idx.name === 'owner_tags_idx');
      assert.ok(tagsIdx, 'owner_tags_idx should exist');
      assert.deepStrictEqual(tagsIdx.key, { owner: 1, tags: 1 });

      // Confirm no redundant standalone owner_1 index
      const redundantOwnerIdx = indexes.find(
        (idx) => idx.name === 'owner_1' && Object.keys(idx.key).length === 1
      );
      assert.strictEqual(redundantOwnerIdx, undefined, 'Redundant owner_1 index must not exist');
    });
  });

  describe('Document Creation & Schema Defaults', () => {
    it('creates a valid document with complete metadata', async () => {
      const paper = await Paper.create({
        title: 'Attention Is All You Need',
        authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'],
        abstract: 'The dominant sequence transduction models...',
        doi: 'https://doi.org/10.48550/arXiv.1706.03762',
        year: 2017,
        publicationDate: new Date('2017-06-12'),
        venue: 'NeurIPS 30',
        publisher: 'Curran Associates, Inc.',
        url: 'https://arxiv.org/abs/1706.03762',
        tags: ['transformer', 'attention', 'nlp'],
        owner: userA,
      });

      assert.ok(paper._id);
      assert.strictEqual(paper.title, 'Attention Is All You Need');
      assert.strictEqual(paper.doi, '10.48550/arxiv.1706.03762');
      assert.strictEqual(paper.year, 2017);
      assert.ok(paper.publicationDate instanceof Date);
      assert.strictEqual(paper.venue, 'NeurIPS 30');
      assert.strictEqual(paper.publisher, 'Curran Associates, Inc.');
      assert.strictEqual(paper.url, 'https://arxiv.org/abs/1706.03762');
      assert.deepStrictEqual(paper.tags, ['transformer', 'attention', 'nlp']);
      assert.strictEqual(paper.owner.toString(), userA.toString());
      assert.ok(paper.createdAt instanceof Date);
      assert.ok(paper.updatedAt instanceof Date);
    });

    it('transforms _id to id and removes _id during JSON serialization', async () => {
      const paper = await Paper.create({
        title: 'JSON Transformation Test Paper',
        authors: ['Alan Turing'],
        owner: userA,
      });

      const json = paper.toJSON();
      assert.strictEqual(json.id, paper._id.toString());
      assert.strictEqual(json._id, undefined);
    });

    it('creates a minimal valid document with only required fields', async () => {
      const paper = await Paper.create({
        title: 'Minimal Metadata Research Note',
        authors: ['Ada Lovelace'],
        owner: userA,
      });

      assert.ok(paper._id);
      assert.strictEqual(paper.title, 'Minimal Metadata Research Note');
      assert.deepStrictEqual(paper.authors, ['Ada Lovelace']);
      assert.strictEqual(paper.doi, undefined);
      assert.strictEqual(paper.abstract, '');
      assert.strictEqual(paper.venue, '');
      assert.strictEqual(paper.publisher, '');
      assert.strictEqual(paper.url, '');
      assert.deepStrictEqual(paper.tags, []);
    });

    it('rejects document missing required title', async () => {
      await assert.rejects(
        Paper.create({
          authors: ['Ada Lovelace'],
          owner: userA,
        }),
        /Paper title is required/
      );
    });

    it('rejects document missing required owner', async () => {
      await assert.rejects(
        Paper.create({
          title: 'Orphan Paper',
          authors: ['Ada Lovelace'],
        }),
        /Paper owner is required/
      );
    });
  });

  describe('DOI Normalization & Validation', () => {
    it('normalizes DOI: strips prefixes, trims whitespace, and converts to lowercase', async () => {
      const paper = await Paper.create({
        title: 'DOI Normalization Test',
        authors: ['Researcher'],
        doi: '  https://doi.org/10.1145/3422622  ',
        owner: userA,
      });

      assert.strictEqual(paper.doi, '10.1145/3422622');
    });

    it('normalizes DOI with dx.doi.org and doi: prefixes', async () => {
      const p1 = await Paper.create({
        title: 'DX DOI Test',
        authors: ['Researcher'],
        doi: 'http://dx.doi.org/10.1038/nature12373',
        owner: userA,
      });
      assert.strictEqual(p1.doi, '10.1038/nature12373');

      const p2 = await Paper.create({
        title: 'Raw Prefix DOI Test',
        authors: ['Researcher'],
        doi: 'doi:10.1109/CVPR.2016.90',
        owner: userA,
      });
      assert.strictEqual(p2.doi, '10.1109/cvpr.2016.90');
    });

    it('accepts valid complex scientific DOI suffixes with legitimate punctuation', async () => {
      const complexDoi = 'doi:10.1002/(SICI)1097-0142(19960515)77:10<2022::AID-CNCR9>3.0.CO;2-O';
      const paper = await Paper.create({
        title: 'Complex Punctuation DOI Test',
        authors: ['Researcher'],
        doi: complexDoi,
        owner: userA,
      });

      assert.strictEqual(
        paper.doi,
        '10.1002/(sici)1097-0142(19960515)77:10<2022::aid-cncr9>3.0.co;2-o'
      );
    });

    it('rejects invalid non-DOI strings', async () => {
      await assert.rejects(
        Paper.create({
          title: 'Invalid DOI Test',
          authors: ['Researcher'],
          doi: 'not-a-valid-doi',
          owner: userA,
        }),
        /Please provide a valid DOI/
      );
    });

    it('stores empty or whitespace-only DOI input as undefined (omitted)', async () => {
      const paper = await Paper.create({
        title: 'Empty DOI String Test',
        authors: ['Researcher'],
        doi: '   ',
        owner: userA,
      });

      assert.strictEqual(paper.doi, undefined);
    });
  });

  describe('Duplicate DOI Handling & Multi-User Independence', () => {
    it('allows multiple papers without DOIs for the same user without collision', async () => {
      const p1 = await Paper.create({
        title: 'First Manual Paper',
        authors: ['Author 1'],
        owner: userA,
      });

      const p2 = await Paper.create({
        title: 'Second Manual Paper',
        authors: ['Author 2'],
        owner: userA,
      });

      const p3 = await Paper.create({
        title: 'Third Manual Paper (empty string DOI)',
        authors: ['Author 3'],
        doi: '',
        owner: userA,
      });

      assert.ok(p1._id);
      assert.ok(p2._id);
      assert.ok(p3._id);
      assert.notStrictEqual(p1._id.toString(), p2._id.toString());
    });

    it('rejects duplicate DOI for the same user via partial unique compound index', async () => {
      await Paper.create({
        title: 'Original Paper',
        authors: ['Author'],
        doi: '10.1145/3422622',
        owner: userA,
      });

      await assert.rejects(
        Paper.create({
          title: 'Duplicate Paper Attempt',
          authors: ['Different Author'],
          doi: 'https://doi.org/10.1145/3422622', // Normalizes to same DOI
          owner: userA,
        }),
        (err) => err.code === 11000 // MongoDB duplicate key error
      );
    });

    it('allows the same DOI to be saved independently by different users', async () => {
      const pA = await Paper.create({
        title: 'User A Paper',
        authors: ['Author'],
        doi: '10.1145/3422622',
        owner: userA,
      });

      const pB = await Paper.create({
        title: 'User B Paper (Same DOI)',
        authors: ['Author'],
        doi: '10.1145/3422622',
        owner: userB,
      });

      assert.ok(pA._id);
      assert.ok(pB._id);
      assert.strictEqual(pA.doi, pB.doi);
      assert.notStrictEqual(pA.owner.toString(), pB.owner.toString());
    });
  });

  describe('Authors Validation', () => {
    it('rejects empty authors array', async () => {
      await assert.rejects(
        Paper.create({
          title: 'No Authors Paper',
          authors: [],
          owner: userA,
        }),
        /At least one author is required/
      );
    });

    it('rejects author entry that is empty or whitespace-only', async () => {
      await assert.rejects(
        Paper.create({
          title: 'Whitespace Author Paper',
          authors: ['Valid Author', '   '],
          owner: userA,
        }),
        /Each author must be a non-empty string/
      );
    });

    it('rejects author name exceeding 200 characters', async () => {
      await assert.rejects(
        Paper.create({
          title: 'Overlong Author Paper',
          authors: ['X'.repeat(201)],
          owner: userA,
        }),
        /Author names cannot exceed 200 characters each/
      );
    });

    it('trims individual author names', async () => {
      const paper = await Paper.create({
        title: 'Untrimmed Authors Paper',
        authors: ['  Grace Hopper  ', '  Margaret Hamilton  '],
        owner: userA,
      });

      assert.deepStrictEqual(paper.authors, ['Grace Hopper', 'Margaret Hamilton']);
    });
  });

  describe('Tags Validation', () => {
    it('trims tag strings properly', async () => {
      const paper = await Paper.create({
        title: 'Untrimmed Tags Paper',
        authors: ['Author'],
        tags: ['  neural-nets  ', '  deep-learning  '],
        owner: userA,
      });

      assert.deepStrictEqual(paper.tags, ['neural-nets', 'deep-learning']);
    });

    it('rejects case-insensitive duplicate tags', async () => {
      await assert.rejects(
        Paper.create({
          title: 'Duplicate Tags Paper',
          authors: ['Author'],
          tags: ['Neural-Networks', 'neural-networks'],
          owner: userA,
        }),
        /Tags must not contain duplicate values/
      );
    });

    it('rejects tag arrays exceeding 30 items', async () => {
      const overlimitTags = Array.from({ length: 31 }, (_, i) => `tag-${i}`);
      await assert.rejects(
        Paper.create({
          title: 'Over 30 Tags Paper',
          authors: ['Author'],
          tags: overlimitTags,
          owner: userA,
        }),
        /Tags list cannot exceed 30 items/
      );
    });

    it('rejects empty or whitespace-only tags', async () => {
      await assert.rejects(
        Paper.create({
          title: 'Empty Tag Paper',
          authors: ['Author'],
          tags: ['valid-tag', '   '],
          owner: userA,
        }),
        /Each tag must be a non-empty string between 1 and 50 characters/
      );
    });

    it('rejects tags exceeding 50 characters', async () => {
      await assert.rejects(
        Paper.create({
          title: 'Overlong Tag Paper',
          authors: ['Author'],
          tags: ['T'.repeat(51)],
          owner: userA,
        }),
        /Each tag must be a non-empty string between 1 and 50 characters/
      );
    });
  });

  describe('Dates Validation', () => {
    it('accepts valid integer year within allowed range', async () => {
      const paper = await Paper.create({
        title: 'Year Test Paper',
        authors: ['Author'],
        year: 2024,
        owner: userA,
      });

      assert.strictEqual(paper.year, 2024);
    });

    it('rejects year in the distant future or before year 1000', async () => {
      await assert.rejects(
        Paper.create({
          title: 'Future Year Paper',
          authors: ['Author'],
          year: 3000,
          owner: userA,
        }),
        /Publication year must be a valid integer between 1000 and the near future/
      );

      await assert.rejects(
        Paper.create({
          title: 'Ancient Year Paper',
          authors: ['Author'],
          year: 999,
          owner: userA,
        }),
        /Publication year must be a valid integer between 1000 and the near future/
      );
    });

    it('rejects non-integer year', async () => {
      await assert.rejects(
        Paper.create({
          title: 'Float Year Paper',
          authors: ['Author'],
          year: 2023.7,
          owner: userA,
        }),
        /Publication year must be a valid integer between 1000 and the near future/
      );
    });

    it('accepts valid publicationDate as Date', async () => {
      const pubDate = new Date('2021-09-15');
      const paper = await Paper.create({
        title: 'Pub Date Paper',
        authors: ['Author'],
        publicationDate: pubDate,
        owner: userA,
      });

      assert.strictEqual(paper.publicationDate.toISOString(), pubDate.toISOString());
    });

    it('rejects invalid publicationDate string', async () => {
      await assert.rejects(
        Paper.create({
          title: 'Invalid Date Paper',
          authors: ['Author'],
          publicationDate: 'not-a-real-date',
          owner: userA,
        }),
        /Cast to date failed|Publication date must be a valid calendar date/
      );
    });
  });

  describe('Owner Immutability', () => {
    it('prevents modifying owner on an existing document', async () => {
      const paper = await Paper.create({
        title: 'Immutable Owner Paper',
        authors: ['Author'],
        owner: userA,
      });

      paper.owner = userB;
      await paper.save();

      const reloaded = await Paper.findById(paper._id);
      assert.strictEqual(reloaded.owner.toString(), userA.toString());
    });
  });

  describe('Scoped Full-Text Search', () => {
    it('executes text search query scoped with leading owner equality filter', async () => {
      await Paper.create({
        title: 'Convolutional Neural Networks for Visual Recognition',
        authors: ['Yann LeCun'],
        tags: ['cnn', 'computer-vision'],
        owner: userA,
      });

      await Paper.create({
        title: 'Deep Residual Learning for Image Recognition',
        authors: ['Kaiming He'],
        tags: ['resnet', 'computer-vision'],
        owner: userB,
      });

      // Search scoped to userA
      const resultsUserA = await Paper.find({
        owner: userA,
        $text: { $search: 'recognition' },
      });

      assert.strictEqual(resultsUserA.length, 1);
      assert.strictEqual(resultsUserA[0].title, 'Convolutional Neural Networks for Visual Recognition');

      // Search scoped to userB
      const resultsUserB = await Paper.find({
        owner: userB,
        $text: { $search: 'recognition' },
      });

      assert.strictEqual(resultsUserB.length, 1);
      assert.strictEqual(resultsUserB[0].title, 'Deep Residual Learning for Image Recognition');
    });
  });
});

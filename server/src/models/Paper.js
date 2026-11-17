import mongoose from 'mongoose';

const paperSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Paper title is required'],
      trim: true,
      minlength: [1, 'Title cannot be empty'],
      maxlength: [1000, 'Title cannot exceed 1000 characters'],
    },
    authors: {
      type: [String],
      required: [true, 'At least one author is required'],
      validate: [
        {
          validator: function (val) {
            return Array.isArray(val) && val.length > 0;
          },
          message: 'At least one author is required',
        },
        {
          validator: function (val) {
            if (!Array.isArray(val)) return false;
            return val.every((author) => typeof author === 'string' && author.trim().length > 0);
          },
          message: 'Each author must be a non-empty string',
        },
        {
          validator: function (val) {
            if (!Array.isArray(val)) return false;
            return val.every((author) => typeof author === 'string' && author.trim().length <= 200);
          },
          message: 'Author names cannot exceed 200 characters each',
        },
      ],
      // Standardize input by trimming individual author strings (without discarding items)
      set: function (authors) {
        if (!Array.isArray(authors)) return authors;
        return authors.map((a) => (typeof a === 'string' ? a.trim() : a));
      },
    },
    abstract: {
      type: String,
      required: false,
      trim: true,
      maxlength: [20000, 'Abstract cannot exceed 20,000 characters'],
      default: '',
    },
    doi: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      // Normalize DOI: strip URL prefixes and coerce empty strings to undefined
      set: function (val) {
        if (!val || typeof val !== 'string') return undefined;
        const cleaned = val
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
          .replace(/^doi:\s*/i, '');
        return cleaned.length > 0 ? cleaned : undefined;
      },
      validate: {
        validator: function (val) {
          if (!val) return true; // Optional field (for manual papers)
          // Relaxed DOI regex: prefix 10.<prefix>/ followed by non-whitespace characters (supporting punctuation)
          return /^10\.\d{4,9}\/\S+$/i.test(val);
        },
        message: 'Please provide a valid DOI (must start with 10.<prefix>/)',
      },
    },
    year: {
      type: Number,
      required: false,
      validate: {
        validator: function (val) {
          if (val === undefined || val === null) return true;
          return Number.isInteger(val) && val >= 1000 && val <= new Date().getFullYear() + 2;
        },
        message: 'Publication year must be a valid integer between 1000 and the near future',
      },
    },
    publicationDate: {
      type: Date,
      required: false,
      validate: {
        validator: function (val) {
          if (!val) return true;
          return !isNaN(new Date(val).getTime());
        },
        message: 'Publication date must be a valid calendar date',
      },
    },
    venue: {
      type: String,
      required: false,
      trim: true,
      maxlength: [500, 'Venue / publication name cannot exceed 500 characters'],
      default: '',
    },
    publisher: {
      type: String,
      required: false,
      trim: true,
      maxlength: [300, 'Publisher name cannot exceed 300 characters'],
      default: '',
    },
    url: {
      type: String,
      required: false,
      trim: true,
      maxlength: [2000, 'External URL cannot exceed 2000 characters'],
      validate: {
        validator: function (val) {
          if (!val) return true;
          return /^https?:\/\/\S+$/i.test(val);
        },
        message: 'Please provide a valid web URL (must begin with http:// or https://)',
      },
      default: '',
    },
    tags: {
      type: [String],
      required: false,
      default: [],
      // Trim strings without silently discarding invalid or duplicate values
      set: function (tags) {
        if (!Array.isArray(tags)) return tags;
        return tags.map((t) => (typeof t === 'string' ? t.trim() : t));
      },
      validate: [
        {
          validator: function (tags) {
            if (!tags) return true;
            return Array.isArray(tags);
          },
          message: 'Tags must be an array of strings',
        },
        {
          validator: function (tags) {
            if (!tags) return true;
            return tags.length <= 30;
          },
          message: 'Tags list cannot exceed 30 items',
        },
        {
          validator: function (tags) {
            if (!tags) return true;
            return tags.every((tag) => typeof tag === 'string' && tag.length > 0 && tag.length <= 50);
          },
          message: 'Each tag must be a non-empty string between 1 and 50 characters',
        },
        {
          validator: function (tags) {
            if (!tags) return true;
            // Case-insensitive duplicate check: reject duplicates explicitly
            const normalized = tags.map((t) => (typeof t === 'string' ? t.toLowerCase() : t));
            return new Set(normalized).size === normalized.length;
          },
          message: 'Tags must not contain duplicate values',
        },
      ],
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Paper owner is required'],
      immutable: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Indexes:

// 1. Partial Unique Compound Index for Duplicate DOI Prevention per User
paperSchema.index(
  { owner: 1, doi: 1 },
  {
    unique: true,
    partialFilterExpression: { doi: { $type: 'string' } },
    name: 'unique_owner_doi_partial',
  }
);

// 2. Chronological Library Listing & Pagination Index
paperSchema.index(
  { owner: 1, createdAt: -1 },
  { name: 'owner_created_at_idx' }
);

// 3. Multi-field Full-Text Search Index with leading owner field
paperSchema.index(
  {
    owner: 1,
    title: 'text',
    tags: 'text',
    authors: 'text',
    venue: 'text',
  },
  {
    weights: {
      title: 10,
      tags: 5,
      authors: 3,
      venue: 1,
    },
    name: 'owner_paper_text_search_idx',
  }
);

// 4. Multikey Index for Tag Filtering within User Library
paperSchema.index(
  { owner: 1, tags: 1 },
  { name: 'owner_tags_idx' }
);

// JSON response transformation: maps _id to id and strips internal fields
paperSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

export const Paper = mongoose.model('Paper', paperSchema);

import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Collection name is required'],
      trim: true,
      minlength: [1, 'Collection name cannot be empty'],
      maxlength: [100, 'Collection name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: false,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: '',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Collection owner is required'],
      immutable: true,
    },
    papers: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Paper',
        },
      ],
      default: [],
      validate: {
        validator: function (val) {
          if (!Array.isArray(val)) return true;
          const stringIds = val.map((id) => id.toString());
          return new Set(stringIds).size === stringIds.length;
        },
        message: 'Collection cannot contain duplicate paper references',
      },
    },
  },
  {
    timestamps: true,
  }
);

// 1. Compound Unique Index: Enforce unique collection names per user (AC-09)
// Different users can have collections with the exact same name.
collectionSchema.index(
  { owner: 1, name: 1 },
  {
    unique: true,
    name: 'unique_owner_collection_name',
  }
);

// 2. Index for listing a user's collections chronologically
collectionSchema.index(
  { owner: 1, createdAt: -1 },
  { name: 'owner_created_at_idx' }
);

// JSON response transformation: maps _id to id and strips internal fields
collectionSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Collection = mongoose.model('Collection', collectionSchema);

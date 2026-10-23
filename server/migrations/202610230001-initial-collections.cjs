// Idempotent operations allow an interrupted migration to be safely retried.
module.exports = {
  async up(db) {
    for (const name of ["users", "notes"]) {
      if (!(await db.listCollections({ name }).hasNext())) await db.createCollection(name);
    }
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("notes").createIndex({ seedKey: 1 }, { unique: true, sparse: true });
    await db.collection("notes").createIndex({ owner: 1 });
  },
  async down(db) {
    // Keep user data: rollback removes only indexes introduced by this migration.
    const indexes = [["users", "email_1"], ["notes", "seedKey_1"], ["notes", "owner_1"]];
    for (const [collection, index] of indexes) {
      if (await db.listCollections({ name: collection }).hasNext()) {
        if (await db.collection(collection).indexExists(index)) await db.collection(collection).dropIndex(index);
      }
    }
  },
};

exports.up = async (db) => {
  await db.run('CREATE INDEX IF NOT EXISTS idx_donations_family_status ON donations(beneficiary_id, status)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_donations_tx_ref ON donations(transaction_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_donations_user ON donations(user_id)');
  await db.run('CREATE INDEX IF NOT EXISTS idx_families_status_sector ON beneficiaries(verification_status, sector)');
};

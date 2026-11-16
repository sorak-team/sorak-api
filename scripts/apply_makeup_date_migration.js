import prisma from '../src/config/prisma.js';

async function main() {
  console.log('Applying migration to add makeup_date column...');
  await prisma.$executeRawUnsafe(`
    ALTER TABLE school_holidays 
    ADD COLUMN IF NOT EXISTS makeup_date DATE;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_holidays_makeup_date ON school_holidays(makeup_date);
  `);
  console.log('✅ Successfully added makeup_date column and index to school_holidays table!');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

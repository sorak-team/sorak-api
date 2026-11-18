-- Migration: Add makeup_date to school_holidays
ALTER TABLE school_holidays 
ADD COLUMN IF NOT EXISTS makeup_date DATE;

CREATE INDEX IF NOT EXISTS idx_holidays_makeup_date ON school_holidays(makeup_date);

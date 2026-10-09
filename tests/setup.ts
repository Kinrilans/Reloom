// Vitest не читает .env сам. Без этой строки тесты стартуют без
// DATABASE_URL и падают на первом же обращении к базе.
import 'dotenv/config'

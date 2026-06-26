/**
 * Preload script to ensure .env variables override shell variables.
 */
import { config } from 'dotenv';

// The `override: true` option is crucial.
config({ override: true });
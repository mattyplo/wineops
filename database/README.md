# WineOps Database

This directory contains the database schema for WineOps.

## Structure

- `schema.sql` - Table definitions
- `views.sql` - Database views
- `policies.sql` - Row Level Security policies
- `migrations/` - Future Supabase migrations

## Current Database

The production database is hosted in Supabase.

During early development, SQL objects may be created manually in the Supabase SQL Editor and copied into this directory.

The long-term goal is to manage all schema changes through version-controlled migrations.
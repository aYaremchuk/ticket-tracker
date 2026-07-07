# frozen_string_literal: true

# Enables the PostgreSQL extensions the schema relies on:
#   - pgcrypto: gen_random_uuid() for UUID primary keys.
#   - citext:   case-insensitive text for unique email (and later team name).
class EnableExtensions < ActiveRecord::Migration[8.1]
  def change
    enable_extension("pgcrypto") unless extension_enabled?("pgcrypto")
    enable_extension("citext") unless extension_enabled?("citext")
  end
end

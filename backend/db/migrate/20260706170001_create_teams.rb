# frozen_string_literal: true

# Teams table. Name is citext so uniqueness comparisons are case-insensitive
# at the DB level (defense in depth alongside the model validation). The unique
# index also acts as the constraint that makes case-insensitive duplicate
# detection reliable under concurrency.
class CreateTeams < ActiveRecord::Migration[8.1]
  def change
    create_table(:teams, id: :uuid, default: -> { "gen_random_uuid()" }) do |t|
      t.citext(:name, null: false)

      t.timestamps
    end

    add_index(:teams, :name, unique: true)
  end
end
